/**
 * Web Scraping Service for SIT Scholar
 * Fetches real data from SIT website and processes it for search results
 */

import { Citation, SourceType } from '../types';

// SIT Website URLs
const SIT_BASE_URL = 'https://sit.ac.in';
const SIT_PAGES: Record<string, string> = {
    home: 'https://sit.ac.in/html/home.html',
    mca: 'https://sit.ac.in/html/department.php?deptid=15',
    principal: 'https://sit.ac.in/html/principal.html',
    administration: 'https://sit.ac.in/html/admin.html',
    departments: 'https://sit.ac.in/html/departments.html',
    admissions: 'https://sit.ac.in/html/admissions.html',
    contact: 'https://sit.ac.in/html/contact.html',
    facilities: 'https://sit.ac.in/html/facilities.html',
    placement: 'https://sit.ac.in/html/placement.html',
    cse: 'https://sit.ac.in/html/department.php?deptid=1',
    ece: 'https://sit.ac.in/html/department.php?deptid=2',
    civil: 'https://sit.ac.in/html/department.php?deptid=3',
    mech: 'https://sit.ac.in/html/department.php?deptid=4',
};

// Cache for scraped content
interface CachedPage {
    content: string;
    extractedData: ExtractedData;
    scrapedAt: number;
    url: string;
}

interface ExtractedData {
    title: string;
    mainContent: string;
    tables: string[][];
    links: { text: string; href: string }[];
    emails: string[];
    phones: string[];
    names: string[];
    headings: string[];
}

interface ScrapedResult {
    success: boolean;
    data: ExtractedData | null;
    url: string;
    error?: string;
    fromCache?: boolean;
}

interface SearchResult {
    content: string;
    citations: Citation[];
    relevantPages: string[];
}

// In-memory cache (persists during session)
const pageCache = new Map<string, CachedPage>();
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// CORS Proxy for browser-based scraping
// Using multiple proxies for reliability
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

let currentProxyIndex = 0;

/**
 * Fetch with CORS proxy and retry logic
 */
async function fetchWithProxy(url: string, retries = 3): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        const proxyUrl = CORS_PROXIES[currentProxyIndex] + encodeURIComponent(url);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml',
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.text();
        } catch (error: any) {
            lastError = error;
            console.warn(`Proxy ${currentProxyIndex} failed for ${url}:`, error.message);

            // Try next proxy
            currentProxyIndex = (currentProxyIndex + 1) % CORS_PROXIES.length;

            // Wait before retry
            if (attempt < retries - 1) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
        }
    }

    throw lastError || new Error('All proxies failed');
}

/**
 * Extract structured data from HTML content
 */
function extractDataFromHTML(html: string, url: string): ExtractedData {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Get title
    const title = doc.querySelector('title')?.textContent?.trim() ||
        doc.querySelector('h1')?.textContent?.trim() ||
        'SIT Page';

    // Extract main content (remove scripts, styles, navigation)
    const clonedDoc = doc.cloneNode(true) as Document;
    clonedDoc.querySelectorAll('script, style, nav, header, footer, .navigation, #menu, .menu').forEach(el => el.remove());

    // Get all text content
    const mainContent = clonedDoc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';

    // Extract tables
    const tables: string[][] = [];
    doc.querySelectorAll('table').forEach(table => {
        const tableData: string[] = [];
        table.querySelectorAll('tr').forEach(row => {
            const rowText = Array.from(row.querySelectorAll('td, th'))
                .map(cell => cell.textContent?.trim() || '')
                .filter(t => t)
                .join(' | ');
            if (rowText) tableData.push(rowText);
        });
        if (tableData.length > 0) tables.push(tableData);
    });

    // Extract links
    const links: { text: string; href: string }[] = [];
    doc.querySelectorAll('a[href]').forEach(a => {
        const text = a.textContent?.trim();
        let href = a.getAttribute('href') || '';
        if (href && !href.startsWith('http') && !href.startsWith('#')) {
            href = new URL(href, url).href;
        }
        if (text && href && !href.startsWith('#')) {
            links.push({ text, href });
        }
    });

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set(mainContent.match(emailRegex) || [])];

    // Extract phone numbers
    const phoneRegex = /(?:\+91[-.\s]?)?(?:\d{10}|\d{5}[-.\s]?\d{5}|\d{4}[-.\s]?\d{6})/g;
    const phones = [...new Set(mainContent.match(phoneRegex) || [])];

    // Extract headings
    const headings: string[] = [];
    doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        const text = h.textContent?.trim();
        if (text && text.length > 2) headings.push(text);
    });

    // Extract names (simple heuristic - capitalized words that might be names)
    const nameRegex = /(?:Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)?\s*[A-Z][a-z]+(?: [A-Z][a-z]+)+/g;
    const potentialNames: string[] = mainContent.match(nameRegex) || [];
    const names: string[] = [...new Set(potentialNames.filter((n: string) => n.length > 5 && n.length < 50))];

    return {
        title,
        mainContent: mainContent.substring(0, 10000), // Limit content size
        tables,
        links: links.slice(0, 50), // Limit links
        emails,
        phones,
        names: names.slice(0, 30),
        headings,
    };
}

/**
 * Scrape a single page with caching
 */
export async function scrapePage(url: string, forceRefresh = false): Promise<ScrapedResult> {
    // Check cache first
    const cached = pageCache.get(url);
    if (cached && !forceRefresh && (Date.now() - cached.scrapedAt) < CACHE_DURATION_MS) {
        console.log(`[Scraper] Cache hit for ${url}`);
        return {
            success: true,
            data: cached.extractedData,
            url,
            fromCache: true,
        };
    }

    console.log(`[Scraper] Fetching ${url}...`);

    try {
        const html = await fetchWithProxy(url);
        const extractedData = extractDataFromHTML(html, url);

        // Update cache
        pageCache.set(url, {
            content: html,
            extractedData,
            scrapedAt: Date.now(),
            url,
        });

        return {
            success: true,
            data: extractedData,
            url,
            fromCache: false,
        };
    } catch (error: any) {
        console.error(`[Scraper] Failed to scrape ${url}:`, error);
        return {
            success: false,
            data: null,
            url,
            error: error.message,
        };
    }
}

/**
 * Determine which pages to scrape based on query intent
 */
function getRelevantPages(query: string): string[] {
    const queryLower = query.toLowerCase();
    const pages: string[] = [];

    // Always include MCA for default department assumption
    const keywords: Record<string, string[]> = {
        mca: ['mca', 'msc computer', 'master of computer', 'computer application'],
        cse: ['cse', 'computer science', 'cs department'],
        ece: ['ece', 'electronics', 'communication'],
        civil: ['civil', 'construction'],
        mech: ['mechanical', 'mech department'],
        principal: ['principal', 'director', 'head of institution'],
        administration: ['administration', 'admin', 'office', 'registrar'],
        admissions: ['admission', 'apply', 'fee', 'fees', 'eligibility', 'criteria'],
        placement: ['placement', 'job', 'career', 'recruit', 'company', 'package', 'salary'],
        facilities: ['facility', 'facilities', 'hostel', 'library', 'lab', 'canteen', 'sports'],
        contact: ['contact', 'address', 'phone', 'email', 'location', 'reach'],
        departments: ['department', 'departments', 'branch', 'branches'],
    };

    // Check query against keywords
    for (const [page, keywordList] of Object.entries(keywords)) {
        if (keywordList.some(kw => queryLower.includes(kw))) {
            if (SIT_PAGES[page]) {
                pages.push(SIT_PAGES[page]);
            }
        }
    }

    // Faculty, HOD queries
    if (/hod|head|faculty|professor|teacher|staff/.test(queryLower)) {
        // For department-specific queries
        if (/mca/.test(queryLower) || pages.length === 0) {
            pages.push(SIT_PAGES.mca);
        }
    }

    // Syllabus queries
    if (/syllabus|curriculum|subject|course/.test(queryLower)) {
        pages.push(SIT_PAGES.mca);
    }

    // General queries - scrape home and department
    if (pages.length === 0) {
        pages.push(SIT_PAGES.home);
        pages.push(SIT_PAGES.mca); // Default department
    }

    return [...new Set(pages)];
}

/**
 * Format scraped data for LLM context
 */
function formatScrapedDataForContext(results: ScrapedResult[]): string {
    const parts: string[] = [];

    for (const result of results) {
        if (!result.success || !result.data) continue;

        const { data, url } = result;
        parts.push(`\n--- SOURCE: ${url} ---`);
        parts.push(`Title: ${data.title}`);

        if (data.headings.length > 0) {
            parts.push(`Sections: ${data.headings.slice(0, 10).join(', ')}`);
        }

        if (data.tables.length > 0) {
            parts.push(`\nTables Found:`);
            data.tables.slice(0, 3).forEach((table, i) => {
                parts.push(`Table ${i + 1}:`);
                table.slice(0, 10).forEach(row => parts.push(`  ${row}`));
            });
        }

        if (data.emails.length > 0) {
            parts.push(`Emails: ${data.emails.join(', ')}`);
        }

        if (data.phones.length > 0) {
            parts.push(`Phone Numbers: ${data.phones.join(', ')}`);
        }

        if (data.names.length > 0) {
            parts.push(`People Mentioned: ${data.names.slice(0, 15).join(', ')}`);
        }

        // Add main content excerpt
        parts.push(`\nContent Summary:\n${data.mainContent.substring(0, 3000)}`);
    }

    return parts.join('\n');
}

/**
 * Build citations from scraped results
 */
function buildCitations(results: ScrapedResult[], query: string): Citation[] {
    const citations: Citation[] = [];

    for (const result of results) {
        if (!result.success || !result.data) continue;

        // Create a descriptive snippet based on query relevance
        const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 2);
        let snippet = result.data.mainContent.substring(0, 200);

        // Try to find a more relevant snippet
        for (const word of queryWords) {
            const idx = result.data.mainContent.toLowerCase().indexOf(word);
            if (idx > 0) {
                const start = Math.max(0, idx - 50);
                const end = Math.min(result.data.mainContent.length, idx + 150);
                snippet = '...' + result.data.mainContent.substring(start, end) + '...';
                break;
            }
        }

        citations.push({
            title: result.data.title,
            url: result.url,
            sourceType: result.url.includes('sit.ac.in') ? SourceType.COLLEGE_WEB : SourceType.EXTERNAL_WEB,
            snippet: snippet.replace(/\s+/g, ' ').trim(),
        });
    }

    return citations;
}

/**
 * Main search function - scrapes relevant pages and returns formatted data
 */
export async function searchSITWebsite(query: string): Promise<SearchResult> {
    console.log(`[Scraper] Searching for: "${query}"`);

    // Determine relevant pages
    const pagesToScrape = getRelevantPages(query);
    console.log(`[Scraper] Will scrape ${pagesToScrape.length} pages:`, pagesToScrape);

    // Scrape all pages in parallel
    const results = await Promise.all(
        pagesToScrape.map(url => scrapePage(url))
    );

    // Filter successful results
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
        return {
            content: 'Unable to fetch data from SIT website. The website may be temporarily unavailable.',
            citations: [],
            relevantPages: pagesToScrape,
        };
    }

    // Format for LLM context
    const content = formatScrapedDataForContext(successfulResults);

    // Build citations
    const citations = buildCitations(successfulResults, query);

    return {
        content,
        citations,
        relevantPages: pagesToScrape,
    };
}

/**
 * Prefetch common pages for faster subsequent queries
 */
export async function prefetchCommonPages(): Promise<void> {
    console.log('[Scraper] Prefetching common pages...');

    const commonPages = [
        SIT_PAGES.home,
        SIT_PAGES.mca,
        SIT_PAGES.principal,
        SIT_PAGES.admissions,
    ];

    // Scrape in parallel but don't await - let it run in background
    Promise.all(commonPages.map(url => scrapePage(url).catch(e => console.warn('Prefetch failed:', e))))
        .then(() => console.log('[Scraper] Prefetch complete'))
        .catch(e => console.warn('[Scraper] Prefetch error:', e));
}

/**
 * Clear the scraper cache
 */
export function clearScraperCache(): void {
    pageCache.clear();
    console.log('[Scraper] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; urls: string[] } {
    return {
        size: pageCache.size,
        urls: Array.from(pageCache.keys()),
    };
}

export { SIT_PAGES, SIT_BASE_URL };
