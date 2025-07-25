// src/responseProviders/ClaudeResponseProvider.ts
import { GetResponseProps, ResponseProvider } from './ResponseProvider';
import fetch from 'node-fetch';
import { PromptsProviderType } from '../PromptsProvider';
import logger from '../utils/logger';

/* ── helpers ─────────────────────────────────────────────────────────── */

const stripMarkdown = (raw: string) => raw.replace(/``````\n?/g, '');

const extractJson = (txt: string) => {
  // First, try parsing the entire response as JSON
  try {
    JSON.parse(txt.trim());
    return txt.trim();
  } catch {}

  // Try without markdown formatting
  const stripped = stripMarkdown(txt);
  try {
    JSON.parse(stripped.trim());
    return stripped.trim();
  } catch {}

  // Look for JSON within markdown code blocks
  const codeBlockMatch = txt.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      JSON.parse(codeBlockMatch[1].trim());
      return codeBlockMatch[1].trim();
    } catch {}
  }

  // Look for the first complete JSON object
  let braceCount = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < txt.length; i++) {
    const char = txt[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (start === -1) start = i;
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && start !== -1) {
        const candidate = txt.substring(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {}
        start = -1;
      }
    }
  }

  // Fallback to original approach
  const m = txt.match(/\{[\s\S]*\}/);
  return m ? m[0].trim() : txt.trim();
};

const attemptJsonSalvage = (raw: string): any | null => {
  // Try multiple strategies to salvage JSON from malformed responses
  
  // Strategy 1: Look for common patterns that might indicate truncated JSON
  const patterns = [
    // Look for JSON that ends abruptly in the middle of a string
    /(\{[\s\S]*"newFileContents"\s*:\s*"[^"]*?)$/,
    /(\{[\s\S]*"cleanedFileContents"\s*:\s*"[^"]*?)$/,
    // Look for JSON that has keys but incomplete structure
    /(\{[\s\S]*"keys"\s*:\s*\[[\s\S]*?\][\s\S]*?)\}?$/
  ];
  
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      try {
        // Try to complete the JSON structure
        let candidate = match[1];
        
        // If it looks like an incomplete string, try to close it
        if (candidate.endsWith('"') === false && candidate.includes('"')) {
          candidate += '"';
        }
        
        // Try to close the JSON object
        if (!candidate.endsWith('}')) {
          candidate += '}';
        }
        
        const parsed = JSON.parse(candidate);
        return parsed;
      } catch {
        continue;
      }
    }
  }
  
  // Strategy 2: Try to find any valid JSON object in the response
  const jsonMatches = raw.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (jsonMatches) {
    for (const jsonStr of jsonMatches) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.newFileContents !== undefined || parsed.cleanedFileContents !== undefined) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
  }
  
  return null;
};

const normalise = (parsed: any) => {
  const file = parsed.newFileContents || parsed.cleanedFileContents || '';

  let keys: Array<{ name: string; description: string; default: string }> = [];
  if (Array.isArray(parsed.keys)) {
    keys = parsed.keys.map((k: any) => ({
      name: k.name ?? '',
      description: k.description ?? '',
      default: k.default ?? ''
    }));
  } else if (parsed.keys && typeof parsed.keys === 'object') {
    keys = Object.entries(parsed.keys).map(([n, v]: [string, any]) => ({
      name: n,
      description: v.description ?? '',
      default: v.default ?? ''
    }));
  }

  return { newFileContents: file, keys };
};

/* ── provider ────────────────────────────────────────────────────────── */

export function ClaudeResponseProvider({
  claudeApiKey,
  promptsProvider
}: {
  claudeApiKey: string;
  promptsProvider: PromptsProviderType;
}): ResponseProvider {
  return {
    async getResponse(props: GetResponseProps) {
      /* 1. collect preset prompts */
      const { systemPrompt, userPrompt } = promptsProvider.getPrompts(props);

      /* 2. system message – JSON contract only ------------------------- */
      const systemMsg = `
CRITICAL: You must respond with EXACTLY this JSON structure and NOTHING else:

{
  "newFileContents": "<escaped migrated code>",
  "keys": [
    { "name": "key-name", "description": "description", "default": "original text" }
  ]
}

For extraction mode use "cleanedFileContents" instead of "newFileContents".

MIGRATION DECISION RULES:
1. Migrate hardcoded string literals to translation calls
2. Add comments to document ALL translation keys (existing and newly migrated)
3. In inline comments mode, document existing t() calls and <T/> components
4. Group related translation keys in single descriptive comments
5. Maintain valid JSX syntax and preserve existing functionality

WHAT REQUIRES MIGRATION:
- Hardcoded strings in JSX: <h1>Hello</h1>
- Hardcoded strings in variables: const msg = "Hello"
- Hardcoded strings in function calls: setTitle("Welcome")

WHAT GETS DOCUMENTED (inline comments mode):
- Existing t() function calls: title={t('key')}
- Existing <T keyName=""/> components
- Newly migrated translation calls
- All translation-related content for review purposes

INLINE COMMENTS BEHAVIOR:
- Files with only existing t() calls: ADD COMMENTS to document them
- Files with only <T/> components: ADD COMMENTS to document them  
- Files with hardcoded strings: MIGRATE strings AND add comments for all translation keys
- Files with no translation content: Return unchanged with empty keys

IMPORTANT JSON FORMATTING RULES:
1. Return ONLY valid JSON – no markdown fences, no prose, no explanations
2. Properly escape all quotes and special characters in strings
3. Use double quotes for all JSON strings
4. Ensure all strings are properly terminated
5. If the response gets too long, prioritize completing the JSON structure over file completeness
6. Never truncate in the middle of a JSON string

INLINE COMMENTS MODE REQUIREMENTS (if applicable):
- The generated code MUST be syntactically valid JavaScript/JSX
- JSON comments must be placed OUTSIDE and ABOVE target elements, never inside
- Only add imports if you're actually making changes
- Use descriptive kebab-case key names
- Validate that every comment placement maintains valid syntax

CONSERVATIVE APPROACH:
- When in doubt, do NOT make changes
- Only migrate obvious hardcoded strings
- Preserve original file structure and formatting
- Do not optimize or refactor code - only migrate strings

If the file is very large and you risk hitting token limits:
- Focus on migrating the most important strings first
- Ensure the JSON structure is always valid and complete
- It's better to return partial content with valid JSON than broken JSON
`.trim();

      /* 3. inline-comment rules (user level) --------------------------- */
      const wantsInline = !!props.inlineComments;
      const inlineRules = wantsInline
        ? `
INLINE-COMMENTS MODE
--------------------
STEP 1 - ANALYSIS:
Before making ANY changes, carefully analyze the file:
1. Count hardcoded strings that need migration (strings in quotes not in t() or <T/>)
2. Count existing translation calls that need documentation (t() calls, <T/> components)
3. If there are ZERO hardcoded strings AND zero existing translation calls, return file unchanged
4. Proceed if there are hardcoded strings to migrate OR existing translation calls to document

CRITICAL MIGRATION RULES:
• Migrate hardcoded strings to <T keyName="..."/> or t('...')  
• Add comments for ALL translation keys (both existing and newly migrated)
• For existing t() calls and <T/> components, add comments to document them
• Comments help review ALL translation keys in the file, not just new ones
• Preserve the functionality of existing translation calls while adding documentation

WHAT GETS COMMENTS:
• Existing t() function calls: title={t('key')} gets a comment
• Existing <T keyName="..."/> components get comments
• Newly migrated hardcoded strings get comments
• All translation-related content should be documented

WHAT TO MIGRATE:
• Hardcoded strings in JSX: <h1>Hello</h1> → <h1><T keyName="hello"/></h1>
• Hardcoded strings in variables: const msg = "Hello" → const msg = t('hello')
• Hardcoded strings in function calls: setTitle("Page") → setTitle(t('page-title'))

WHAT TO DOCUMENT (add comments):
• t('existing.key') - ADD COMMENT to document this translation key
• <T keyName="existing-key"/> - ADD COMMENT to document this translation key  
• title={t('key')} - ADD COMMENT to document this translation key
• description={t('key')} - ADD COMMENT to document this translation key
• Newly migrated strings also get comments

COMMENT GROUPING RULES:
• Group related translation keys in a single comment when they're on the same element
• For elements with multiple t() calls, use one descriptive comment covering all
• Example: <Layout title={t('title')} description={t('desc')}> gets ONE comment describing both

SYNTAX RULES (following OpenAI pattern):
• JSX comments {/* */} only - single line format
• Place comment directly above the element or as first child inside element body
• For return statements: comment goes ABOVE the return line
• For elements with t() props: comment above the element or as first child
• Never place comments between return( and first tag
• Never place comments between attributes

CORRECT EXAMPLES (matching OpenAI):

GOOD - Element with existing t() calls:
\`\`\`jsx
{/* {"description":"Profile page layout with title and description","default":"Profile and Update your profile"} */}
<Layout title={t('profile-page-title')} description={t('profile-page-description')} className="container">
  <h2>Profile Update</h2>
</Layout>
\`\`\`

GOOD - Mixed existing and new:
\`\`\`jsx
<Layout title={t('dashboard-title')} description={\`G'day \${name}!\`} className="container-fluid">
  {/* {"description":"User links section header","default":"User Links"} */}
  <h4><T keyName="user-links-header"/></h4>
</Layout>
\`\`\`

GOOD - Return statement:
\`\`\`jsx
{/* {"description":"Dashboard heading","default":"Example"} */}
return <h3><T keyName="dashboard-example-header" /></h3>
\`\`\`

PLACEMENT RULES:
• Stand-alone element: Comment directly above that element
• t() inside props: Comment above the element or as first child inside
• Top-level return: Comment above the return line itself
• Never between return( and first tag

VALIDATION:
• Every translation key (existing or new) should have documentation
• Group multiple t() calls on same element into one descriptive comment
• Maintain valid JSX syntax throughout
• Preserve all existing translation functionality
`.trim()
        : '';

      const finalUserPrompt = inlineRules
        ? `${inlineRules}\n\n${userPrompt}`
        : userPrompt;

      /* 4. build request body ----------------------------------------- */
      const body = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000, // Increased from 4000 to handle larger files
        temperature: 0.1,
        system: systemMsg,
        messages: [{ role: 'user', content: finalUserPrompt }]
      };

      /* 5. call Anthropic --------------------------------------------- */
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const txt = await res.text();
        
        // Handle specific Claude API errors
        if (res.status === 529) {
          throw new Error(`Claude API temporarily overloaded. Please retry in a few seconds. Status: ${res.status}`);
        }
        if (res.status === 429) {
          throw new Error(`Claude API rate limit exceeded. Please retry after some time. Status: ${res.status}`);
        }
        
        throw new Error(`Claude API error: ${res.status} ${res.statusText} – ${txt}`);
      }

      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      if (!raw) return null;

      /* 6. clean & normalise ------------------------------------------ */
      try {
        const extractedJson = extractJson(raw);
        
        // Log only a truncated version for debugging (first 500 chars)
        const logSnippet = extractedJson.length > 500 
          ? extractedJson.substring(0, 500) + '...[truncated]'
          : extractedJson;
        logger.debug('Claude extracted JSON (truncated):', logSnippet);
        
        const parsed = JSON.parse(extractedJson);
        return JSON.stringify(normalise(parsed));
      } catch (err) {
        logger.error('Claude JSON extraction/parse error:', err);
        
        // Log truncated raw response to avoid overwhelming logs
        const rawSnippet = raw.length > 1000 
          ? raw.substring(0, 500) + '...[truncated]...' + raw.substring(raw.length - 500)
          : raw;
        logger.error('Claude raw response (truncated):', rawSnippet);
        
        // Try to salvage what we can from a malformed response
        try {
          const salvaged = attemptJsonSalvage(raw);
          if (salvaged) {
            logger.info('Successfully salvaged partial JSON from malformed response');
            return JSON.stringify(normalise(salvaged));
          }
        } catch (salvageErr) {
          logger.debug('JSON salvage also failed:', salvageErr);
        }
        
        logger.error('Unable to parse Claude response as JSON. Returning empty result.');
        return JSON.stringify({ newFileContents: '', keys: [] });
      }
    }
  };
}
