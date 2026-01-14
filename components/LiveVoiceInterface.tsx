import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { X, Mic, MicOff, Volume2 } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LiveVoiceInterfaceProps {
    onClose: () => void;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to convert Float32Array to 16-bit PCM for Gemini
function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    }
    return new Blob([int16], { type: 'audio/pcm' });
}

// Base64 decoding
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

export const LiveVoiceInterface: React.FC<LiveVoiceInterfaceProps> = ({ onClose }) => {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false); // Model is speaking

    // Audio Contexts
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);

    // Stream References
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Playback Queue
    const nextStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const sessionRef = useRef<any>(null);

    useEffect(() => {
        let isMounted = true;
        let sessionPromise: Promise<any> | null = null;

        const startSession = async () => {
            try {
                // Initialize Audio Contexts
                inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                outputNodeRef.current = outputContextRef.current.createGain();
                outputNodeRef.current.connect(outputContextRef.current.destination);

                // Get Microphone
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;

                // Prepare RAG Context based on internal docs
                const docs = StorageService.getDocuments();
                const contextText = docs.map(d => `[Internal Document: ${d.title}]\n${d.content}`).join('\n\n');
                const voiceSystemInstruction = `You are SIT Scholar.
                CRITICAL: Use the following knowledge base to answer questions about students (USN, DOB), faculty, and fees.
                If asked about a specific person, look them up.
                KNOWLEDGE BASE:
                ${contextText}`;

                // Connect to Gemini Live
                sessionPromise = ai.live.connect({
                    model: 'gemini-2.5-flash',
                    callbacks: {
                        onopen: () => {
                            if (!isMounted) return;
                            setStatus('connected');

                            // Setup Audio Input Stream
                            if (!inputContextRef.current) return;
                            const ctx = inputContextRef.current;
                            sourceRef.current = ctx.createMediaStreamSource(stream);
                            processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

                            processorRef.current.onaudioprocess = (e) => {
                                if (isMuted) return;
                                const inputData = e.inputBuffer.getChannelData(0);
                                const pcmBlob = createBlob(inputData);

                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    const base64data = (reader.result as string).split(',')[1];
                                    sessionPromise?.then(session => {
                                        session.sendRealtimeInput({
                                            media: {
                                                mimeType: 'audio/pcm;rate=16000',
                                                data: base64data
                                            }
                                        });
                                    });
                                };
                                reader.readAsDataURL(pcmBlob);
                            };

                            sourceRef.current.connect(processorRef.current);
                            processorRef.current.connect(ctx.destination);
                        },
                        onmessage: async (message: LiveServerMessage) => {
                            if (!isMounted) return;

                            // Handle Audio Output
                            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                            if (base64Audio && outputContextRef.current) {
                                setIsSpeaking(true);
                                const ctx = outputContextRef.current;

                                const audioBuffer = await decodeAudioData(
                                    decode(base64Audio),
                                    ctx,
                                    24000
                                );

                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputNodeRef.current!);

                                source.onended = () => {
                                    audioSourcesRef.current.delete(source);
                                    if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
                                };

                                source.start(nextStartTimeRef.current);
                                nextStartTimeRef.current += audioBuffer.duration;
                                audioSourcesRef.current.add(source);
                            }

                            // Handle Interruptions
                            if (message.serverContent?.interrupted) {
                                audioSourcesRef.current.forEach(src => src.stop());
                                audioSourcesRef.current.clear();
                                nextStartTimeRef.current = 0;
                                setIsSpeaking(false);
                            }
                        },
                        onclose: () => {
                            console.log("Live session closed");
                        },
                        onerror: (e) => {
                            console.error("Live session error", e);
                            setStatus('error');
                        }
                    },
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                        },
                        systemInstruction: voiceSystemInstruction,
                    }
                });

                sessionRef.current = await sessionPromise;

            } catch (e) {
                console.error(e);
                setStatus('error');
            }
        };

        startSession();

        return () => {
            isMounted = false;
            // Cleanup
            if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
            if (processorRef.current) processorRef.current.disconnect();
            if (sourceRef.current) sourceRef.current.disconnect();
            if (inputContextRef.current) inputContextRef.current.close();
            if (outputContextRef.current) outputContextRef.current.close();
            // Note: Currently no method to manually close session in SDK interface, it closes on ws disconnect
        };
    }, []);

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    return (
        <div className="absolute inset-0 z-50 bg-[#0f0f10] flex flex-col items-center justify-center animate-fade-in">
            <button onClick={onClose} className="absolute top-6 right-6 p-3 text-gray-400 hover:text-white bg-white/10 rounded-full">
                <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center space-y-12">
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold text-white">Live Conversation</h2>
                    <p className={`text-sm ${status === 'connected' ? 'text-green-400' : 'text-gray-400'}`}>
                        {status === 'connecting' ? 'Connecting...' : status === 'connected' ? 'Listening' : 'Connection Error'}
                    </p>
                </div>

                {/* Visualizer Circle */}
                <div className="relative">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'bg-indigo-500 scale-110 shadow-[0_0_50px_rgba(99,102,241,0.5)]' : 'bg-gray-800'}`}>
                        {isSpeaking ? (
                            <Volume2 className="w-12 h-12 text-white animate-pulse" />
                        ) : (
                            <Mic className={`w-12 h-12 ${isMuted ? 'text-red-400' : 'text-white'}`} />
                        )}
                    </div>
                    {/* Ripple effect */}
                    <div className={`absolute inset-0 rounded-full border-2 border-indigo-500/30 ${isSpeaking ? 'animate-ping' : ''}`}></div>
                </div>

                <div className="flex gap-6">
                    <button
                        onClick={toggleMute}
                        className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                    >
                        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-4 rounded-full bg-gray-800 text-red-400 hover:bg-gray-700 hover:text-red-300 transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="max-w-md text-center">
                    <p className="text-gray-500 text-sm">
                        Speak naturally. You can interrupt at any time.
                    </p>
                </div>
            </div>
        </div>
    );
};
