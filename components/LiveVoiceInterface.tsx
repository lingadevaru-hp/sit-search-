import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { X, Mic, MicOff, Volume2, AlertCircle, RefreshCw } from 'lucide-react';

interface LiveVoiceInterfaceProps {
    onClose: () => void;
}

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

export const LiveVoiceInterface: React.FC<LiveVoiceInterfaceProps> = ({ onClose }) => {
    const [status, setStatus] = useState<'connecting' | 'listening' | 'speaking' | 'error'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [audioLevel, setAudioLevel] = useState(0);

    const sessionRef = useRef<any>(null);
    const aiRef = useRef<GoogleGenAI | null>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioQueueRef = useRef<AudioBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const isMountedRef = useRef(true);

    // Decode base64 PCM to AudioBuffer
    const decodeAudio = useCallback((base64: string): AudioBuffer | null => {
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const int16 = new Int16Array(bytes.buffer);
            const ctx = outputContextRef.current;
            if (!ctx) return null;

            const buffer = ctx.createBuffer(1, int16.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) {
                channel[i] = int16[i] / 32768;
            }
            return buffer;
        } catch (e) {
            console.error('Decode error:', e);
            return null;
        }
    }, []);

    // Play queued audio
    const playNextAudio = useCallback(() => {
        if (!outputContextRef.current || audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            if (isMountedRef.current && status === 'speaking') {
                setStatus('listening');
            }
            return;
        }

        isPlayingRef.current = true;
        if (isMountedRef.current) setStatus('speaking');

        const buffer = audioQueueRef.current.shift()!;
        const source = outputContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(outputContextRef.current.destination);

        source.onended = () => {
            currentSourceRef.current = null;
            playNextAudio();
        };

        currentSourceRef.current = source;
        source.start(0);
    }, [status]);

    // Add audio to queue
    const enqueueAudio = useCallback((base64: string) => {
        const buffer = decodeAudio(base64);
        if (buffer) {
            audioQueueRef.current.push(buffer);
            console.log('[Live] Audio queued:', buffer.duration.toFixed(2), 's');
            if (!isPlayingRef.current) {
                playNextAudio();
            }
        }
    }, [decodeAudio, playNextAudio]);

    // Stop audio playback
    const stopAudio = useCallback(() => {
        if (currentSourceRef.current) {
            try { currentSourceRef.current.stop(); } catch { }
        }
        audioQueueRef.current = [];
        isPlayingRef.current = false;
    }, []);

    // Cleanup
    const cleanup = useCallback(() => {
        console.log('[Live] Cleaning up...');
        stopAudio();

        if (processorRef.current) {
            try { processorRef.current.disconnect(); } catch { }
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
        }

        if (inputContextRef.current?.state !== 'closed') {
            try { inputContextRef.current?.close(); } catch { }
        }
        if (outputContextRef.current?.state !== 'closed') {
            try { outputContextRef.current?.close(); } catch { }
        }

        if (sessionRef.current) {
            try { sessionRef.current.close?.(); } catch { }
        }

        sessionRef.current = null;
        inputContextRef.current = null;
        outputContextRef.current = null;
    }, [stopAudio]);

    // Start session
    const startSession = useCallback(async () => {
        if (!isMountedRef.current) return;

        try {
            setStatus('connecting');
            setErrorMessage('');
            console.log('[Live] Starting session...');

            if (!apiKey) throw new Error('API key not configured');

            aiRef.current = new GoogleGenAI({ apiKey });

            // Create audio contexts
            inputContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputContextRef.current = new AudioContext({ sampleRate: 24000 });

            // Get microphone
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });
            mediaStreamRef.current = stream;

            // Setup analyser for level visualization
            analyserRef.current = inputContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            const source = inputContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);

            // Audio level monitoring
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            const updateLevel = () => {
                if (!isMountedRef.current || !analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(avg / 255);
                requestAnimationFrame(updateLevel);
            };
            updateLevel();

            // System instruction
            const systemInstruction = `You are SIT Scholar, a helpful voice assistant for Siddaganga Institute of Technology.
Keep responses very short (1-2 sentences). Be conversational and natural.
MCA HOD is Dr. Premasudha B G. Principal is Dr. Shivakumara Swamy.`;

            console.log('[Live] Connecting to Gemini Live...');

            // Connect to Gemini Live
            const session = await aiRef.current.live.connect({
                model: 'gemini-2.0-flash-live-001',
                callbacks: {
                    onopen: () => {
                        console.log('[Live] Session opened');
                        if (!isMountedRef.current) return;
                        setStatus('listening');
                        startAudioCapture();
                    },
                    onmessage: (message: any) => {
                        if (!isMountedRef.current) return;

                        // Look for audio data in the response
                        const parts = message.serverContent?.modelTurn?.parts || [];
                        for (const part of parts) {
                            const audioData = part.inlineData?.data;
                            const mimeType = part.inlineData?.mimeType || '';

                            if (audioData && mimeType.includes('audio')) {
                                console.log('[Live] Received audio chunk');
                                enqueueAudio(audioData);
                            }
                        }

                        // Handle interruption
                        if (message.serverContent?.interrupted) {
                            console.log('[Live] Interrupted');
                            stopAudio();
                            setStatus('listening');
                        }
                    },
                    onclose: () => {
                        console.log('[Live] Session closed');
                        if (isMountedRef.current) {
                            setStatus('error');
                            setErrorMessage('Connection closed');
                        }
                    },
                    onerror: (e: any) => {
                        console.error('[Live] Error:', e);
                        if (isMountedRef.current) {
                            setStatus('error');
                            setErrorMessage(e?.message || 'Connection error');
                        }
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' }
                        }
                    },
                    systemInstruction: systemInstruction
                }
            });

            sessionRef.current = session;
            console.log('[Live] Session connected');

        } catch (e: any) {
            console.error('[Live] Start error:', e);
            if (isMountedRef.current) {
                setStatus('error');
                setErrorMessage(e.message || 'Failed to start');
            }
            cleanup();
        }
    }, [cleanup, enqueueAudio, stopAudio]);

    // Capture and send audio
    const startAudioCapture = useCallback(() => {
        if (!inputContextRef.current || !mediaStreamRef.current || !sessionRef.current) return;

        console.log('[Live] Starting audio capture...');
        const ctx = inputContextRef.current;
        const source = ctx.createMediaStreamSource(mediaStreamRef.current);
        processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

        processorRef.current.onaudioprocess = (e) => {
            if (isMuted || !sessionRef.current || status === 'speaking') return;

            const input = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            const bytes = new Uint8Array(int16.buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            try {
                sessionRef.current.sendRealtimeInput({
                    media: { mimeType: 'audio/pcm;rate=16000', data: base64 }
                });
            } catch (e) {
                // Ignore send errors
            }
        };

        source.connect(processorRef.current);
        processorRef.current.connect(ctx.destination);
    }, [isMuted, status]);

    // Lifecycle
    useEffect(() => {
        isMountedRef.current = true;
        const timer = setTimeout(() => startSession(), 100);

        return () => {
            isMountedRef.current = false;
            clearTimeout(timer);
            cleanup();
        };
    }, []);

    const handleClose = () => {
        cleanup();
        onClose();
    };

    const getStatusText = () => {
        switch (status) {
            case 'connecting': return 'Connecting...';
            case 'listening': return isMuted ? 'Muted' : 'Listening...';
            case 'speaking': return 'Speaking...';
            case 'error': return 'Error';
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center">
            <button
                onClick={handleClose}
                className="absolute top-6 right-6 p-3 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-full"
            >
                <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center space-y-8">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">Live Voice</h2>
                    <p className={`text-lg ${status === 'speaking' ? 'text-blue-400' :
                            status === 'listening' ? 'text-green-400' :
                                status === 'error' ? 'text-red-400' : 'text-gray-400'
                        }`}>
                        {getStatusText()}
                    </p>
                    {errorMessage && <p className="text-sm text-red-400 mt-2">{errorMessage}</p>}
                </div>

                {/* Visualizer */}
                <div className="relative">
                    <div
                        className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${status === 'speaking' ? 'bg-blue-600 scale-110' :
                                status === 'listening' ? 'bg-green-600' :
                                    status === 'error' ? 'bg-red-600/50' : 'bg-gray-700'
                            }`}
                        style={{
                            boxShadow: status === 'speaking'
                                ? '0 0 60px rgba(59, 130, 246, 0.5)'
                                : status === 'listening'
                                    ? `0 0 ${20 + audioLevel * 40}px rgba(34, 197, 94, ${0.3 + audioLevel * 0.3})`
                                    : 'none'
                        }}
                    >
                        {status === 'speaking' ? (
                            <Volume2 className="w-12 h-12 text-white animate-pulse" />
                        ) : status === 'error' ? (
                            <AlertCircle className="w-12 h-12 text-red-400" />
                        ) : status === 'connecting' ? (
                            <RefreshCw className="w-12 h-12 text-gray-400 animate-spin" />
                        ) : (
                            <Mic className={`w-12 h-12 ${isMuted ? 'text-red-400' : 'text-white'}`} />
                        )}
                    </div>

                    {/* Level ring */}
                    {status === 'listening' && !isMuted && (
                        <div
                            className="absolute inset-0 rounded-full border-2 border-green-400/50 transition-transform"
                            style={{ transform: `scale(${1 + audioLevel * 0.3})` }}
                        />
                    )}
                </div>

                {/* Audio bars */}
                {(status === 'listening' || status === 'speaking') && (
                    <div className="flex items-end gap-1 h-6">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div
                                key={i}
                                className={`w-1.5 rounded-full ${status === 'speaking' ? 'bg-blue-400' : 'bg-green-400'}`}
                                style={{
                                    height: `${Math.random() * (status === 'speaking' ? 20 : audioLevel * 20) + 4}px`,
                                    transition: 'height 0.1s ease'
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Controls */}
                <div className="flex gap-4">
                    {status === 'error' ? (
                        <button
                            onClick={() => { cleanup(); startSession(); }}
                            className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 flex items-center gap-2"
                        >
                            <RefreshCw className="w-5 h-5" /> Retry
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            disabled={status !== 'listening' && status !== 'speaking'}
                            className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                                } disabled:opacity-50`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>
                    )}
                    <button
                        onClick={handleClose}
                        className="p-4 rounded-full bg-gray-700 text-red-400 hover:bg-gray-600"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <p className="text-gray-500 text-sm text-center max-w-xs">
                    {status === 'listening' ? 'Speak naturally. I\'ll respond with voice.' :
                        status === 'speaking' ? 'I\'m speaking. You can interrupt anytime.' :
                            status === 'error' ? 'Something went wrong. Try again.' :
                                'Setting up voice connection...'}
                </p>
            </div>
        </div>
    );
};
