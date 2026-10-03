import katex from 'katex';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeMathSyntax(expr: string): string {
  let s = expr.trim();
  // Convert exponents with numbers/decimals (including negative): K^0.5 -> K^{0.5}, K^-0.5 -> K^{-0.5}, x^2 -> x^{2}
  s = s.replace(/\^([+-]?[0-9]+(?:\.[0-9]+)?)/g, '^{$1}');
  return s;
}

export function renderKatex(expr: string, display = false): string {
  try {
    return katex.renderToString(normalizeMathSyntax(expr), {
      displayMode: display,
      throwOnError: false,
    });
  } catch {
    return escapeHtml(expr);
  }
}

const COMMON_PROSE_WORDS =
  /\b(the|is|and|or|are|was|were|of|in|to|for|with|that|this|these|those|which|what|when|where|why|how|from|by|at|if|then|than|as|on|an|a|be|have|has|had|do|does|did|will|would|shall|should|can|could|may|might|must|not|no|so|such|each|every|all|both|neither|either|between|among|per|unit|units|dollars?|cents?|percent|profit|revenue|cost|costs|output|quantity|firm|firms|market|markets|price|prices|demand|supply|labor|capital|increase|decrease|equals?|greater|less|maxim(?:ize|um)|minim(?:ize|um)|total|average|marginal|constant|returns?|scale)\b/i;

function isValidInlineMath(content: string): boolean {
  if (!content || !content.trim()) return false;
  const trimmed = content.trim();
  if (COMMON_PROSE_WORDS.test(trimmed) && !trimmed.includes('\\text')) {
    return false;
  }
  if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(trimmed)) {
    return false;
  }
  return true;
}

export function isMathToken(rawToken: string): boolean {
  const token = rawToken.replace(/[.,;:!?]+$/, '');
  if (!token) return false;
  if (COMMON_PROSE_WORDS.test(token)) return false;

  // Math operators & symbols
  if (/^([\^=_\\/+\-*()<>{}[\]]|<=|>=|!=|==|\b(?:times|cdot|div|pm|mp|le|ge|approx|neq)\b)$/.test(token)) return true;
  // Numbers & percentages
  if (/^[+-]?[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?%?$/.test(token)) return true;
  // Single variable with optional power or subscript: e.g. x, x^2, K^0.5, L^{0.5}, Q_d, P_0, x'
  if (/^[a-zA-Z](?:'|_[a-zA-Z0-9]+)?(?:\^[+-]?[0-9a-zA-Z.()\-+]+|\^\{[^{}]+\})?$/.test(token)) return true;
  // Coefficient with variable & optional power/subscript: e.g. 2x, 4K, 0.5L, -2Q, 4K^0.5, 2x^2, 0.5L^{0.5}, 3P_1
  if (/^[+-]?[0-9]+(?:\.[0-9]+)?[a-zA-Z](?:'|_[a-zA-Z0-9]+)?(?:\^[+-]?[0-9a-zA-Z.()\-+]+|\^\{[^{}]+\})?$/.test(token)) return true;
  // Product of variables with powers: e.g. 4K^0.5L^0.5, KL, 2xy, x^2y
  if (/^[+-]?[0-9]*(?:\.[0-9]+)?(?:[a-zA-Z](?:\^[+-]?[0-9a-zA-Z.()\-+]+|\^\{[^{}]+\}|_[a-zA-Z0-9]+)?){2,}$/.test(token)) return true;
  // Economics / stats / finance acronyms: TC, MC, MR, TR, ATC, AVC, AFC, MP, AP, MRS, MRTS, GDP, GNP, NPV, IRR, CPI, WACC, SD, SE, Var, Cov
  if (/^(TC|MC|MR|TR|ATC|AVC|AFC|MP|AP|MRS|MRTS|GDP|GNP|NPV|IRR|CPI|WACC|SD|SE|Var|Cov)(?:_[a-zA-Z0-9]+)?(?:\^[+-]?[0-9a-zA-Z.()\-+]+|\^\{[^{}]+\})?$/i.test(token)) return true;
  // Mathematical functions and Greek letters
  if (/^\\?(sin|cos|tan|ln|log|exp|lim|det|max|min|sqrt|frac|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|tau|phi|omega)$/i.test(token)) return true;
  // Parenthesized math expression: e.g. (1-t), (P-MC), (1+r)
  if (/^\([a-zA-Z0-9+\-*/^._{}]+\)$/.test(token)) return true;
  // LaTeX command with braces: e.g. \frac{1}{2}, \sqrt{x}
  if (/^\\[a-zA-Z]+(?:\{[^{}]*\})+$/.test(token)) return true;

  return false;
}

export function renderMathText(text: string): string {
  if (!text) return '';

  // 1. Protect currency amounts like $50, $1,000, $25.50, ($50) so inline $ parser doesn't mistake them for LaTeX delimiters
  const currencyTokens: string[] = [];
  const withCurrencyProtected = text.replace(
    /(^|[\s(\[{"'~:/-])\$(\d+(?:,\d{3})*(?:\.\d+)?)(?=[\s)\]}"'.,;:!?/-]|$)/g,
    (_match, prefix, amount) => {
      const id = `___CURRENCY_${currencyTokens.length}___`;
      currencyTokens.push('$' + amount);
      return prefix + id;
    },
  );

  // 2. Extract explicit LaTeX delimiters:
  // - $$...$$ (display)
  // - \[...\] (display)
  // - \(...\) (inline)
  // - $...$ (inline)
  const explicitRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)[^\$\n]+?(?<!\s)\$)/g;

  interface Segment {
    type: 'text' | 'math-inline' | 'math-display';
    content: string;
  }

  const segments: Segment[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = explicitRegex.exec(withCurrencyProtected)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: 'text', content: withCurrencyProtected.slice(lastIdx, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      segments.push({ type: 'math-display', content: token.slice(2, -2) });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      segments.push({ type: 'math-display', content: token.slice(2, -2) });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      segments.push({ type: 'math-inline', content: token.slice(2, -2) });
    } else if (token.startsWith('$') && token.endsWith('$')) {
      const inner = token.slice(1, -1);
      if (isValidInlineMath(inner)) {
        segments.push({ type: 'math-inline', content: inner });
      } else {
        segments.push({ type: 'text', content: token });
      }
    }
    lastIdx = explicitRegex.lastIndex;
  }

  if (lastIdx < withCurrencyProtected.length) {
    segments.push({ type: 'text', content: withCurrencyProtected.slice(lastIdx) });
  }

  // 3. For any text segment, detect standard math notation:
  // - Equations & inequalities: "Q = 4K^0.5 L^0.5", "f(x) = x^2", "P = 100 - 2Q", "P < AVC"
  // - Raw LaTeX macros: \frac{a}{b}, \sqrt{x}, \alpha, \beta, etc.
  // - Exponents/powers: 4K^0.5, x^2, e^-rt
  // - Subscripts: Q_d, P_0
  // - Algebraic terms: 2x, -3x
  let finalHtml = '';

  for (const seg of segments) {
    if (seg.type === 'math-display') {
      finalHtml += renderKatex(seg.content, true);
    } else if (seg.type === 'math-inline') {
      finalHtml += renderKatex(seg.content, false);
    } else {
      const txt = seg.content;
      let i = 0;
      while (i < txt.length) {
        // Raw latex command like \frac{...} or \alpha
        if (txt[i] === '\\' && i + 1 < txt.length && /[a-zA-Z]/.test(txt[i + 1])) {
          const latexMatch = txt.slice(i).match(/^(\\[a-zA-Z]+(?:\{[^{}]*\})*)/);
          if (latexMatch) {
            finalHtml += renderKatex(latexMatch[1], false);
            i += latexMatch[1].length;
            continue;
          }
        }

        // Must be at a word boundary to start an equation or math term
        const prevChar = i > 0 ? txt[i - 1] : '';
        const isBoundary = !prevChar || !/[a-zA-Z0-9_]/.test(prevChar);

        if (isBoundary) {
          // Equation or inequality starting here: e.g. "Q = ...", "f(x) = ...", "TC = ...", "P < AVC"
          const eqLhsMatch = txt
            .slice(i)
            .match(/^((?:[a-zA-Z](?:\([a-zA-Z0-9,\s+\-*/^.]+\)|'[a-zA-Z0-9]*|_[a-zA-Z0-9]+)?|(?:TC|MC|MR|TR|ATC|AVC|AFC|MP|AP|MRS|MRTS|GDP|GNP|NPV|IRR|CPI|WACC|SD|SE|Var|Cov)(?:_[a-zA-Z0-9]+)?|d[a-zA-Z]\/d[a-zA-Z])\s*(=|<=|>=|<|>|\\le|\\ge|\\approx|\\neq)\s*)/);

          if (eqLhsMatch) {
            const lhsAndOp = eqLhsMatch[1];
            const rest = txt.slice(i + lhsAndOp.length);
            const tokens = rest.split(/(\s+)/);

            let validCount = 0;
            let trailingPunct = '';

            for (let t = 0; t < tokens.length; t += 2) {
              const tok = tokens[t];
              const stripped = tok.replace(/[.,;:!?]+$/, '');
              const punct = tok.slice(stripped.length);

              if (isMathToken(stripped)) {
                validCount = t / 2 + 1;
                trailingPunct = punct;
                if (punct.length > 0) {
                  // Sentence punctuation ended the formula here
                  break;
                }
              } else {
                break;
              }
            }

            if (validCount > 0) {
              let rhsMath = '';
              let advance = 0;
              for (let k = 0; k < validCount; k++) {
                const tok = tokens[k * 2];
                const ws = tokens[k * 2 + 1] || '';
                if (k === validCount - 1) {
                  const stripped = tok.replace(/[.,;:!?]+$/, '');
                  rhsMath += stripped;
                  advance += tok.length;
                } else {
                  rhsMath += tok + ws;
                  advance += tok.length + ws.length;
                }
              }

              finalHtml += renderKatex(lhsAndOp + rhsMath, false) + escapeHtml(trailingPunct);
              i += lhsAndOp.length + advance;
              continue;
            }
          }

          // Exponent or algebraic term at word boundary: e.g. "4K^0.5", "x^2", "2x", "Q_d"
          const termMatch = txt
            .slice(i)
            .match(/^(\b[a-zA-Z0-9()]+\^[+-]?[0-9a-zA-Z.()\-+]+(?:\s+[a-zA-Z0-9()]+\^[+-]?[0-9a-zA-Z.()\-+]+)*|\b[+-]?[0-9]+(?:\.[0-9]+)?[a-zA-Z](?:_[a-zA-Z0-9]+)?\b|\b[a-zA-Z]_[a-zA-Z0-9]+\b)/);

          if (termMatch) {
            let term = termMatch[1];
            let trailingPunct = '';
            const punctMatch = term.match(/[.,;:!?]+$/);
            if (punctMatch) {
              trailingPunct = punctMatch[0];
              term = term.slice(0, -trailingPunct.length);
            }
            finalHtml += renderKatex(term, false) + escapeHtml(trailingPunct);
            i += termMatch[1].length;
            continue;
          }
        }

        // Normal character
        finalHtml += escapeHtml(txt[i]);
        i++;
      }
    }
  }

  // 4. Restore currency tokens
  for (let c = 0; c < currencyTokens.length; c++) {
    const id = `___CURRENCY_${c}___`;
    finalHtml = finalHtml.replace(id, escapeHtml(currencyTokens[c]));
  }

  return finalHtml;
}
