/**
 * DD Engine — Local Analysis Engine
 * Prime Alpha Securities
 *
 * Runs entirely offline. No API calls. No paid services.
 * Reads document text and form data, applies investment analysis rules,
 * returns structured JSON in the same format as the Claude API version.
 *
 * Include this script in all three HTML pages.
 */

window.LocalEngine = (function() {

  // ── Text extraction from uploaded file ──────────────────────────────────────
  async function extractText(file) {
    /**
     * Extracts plain text from a file for analysis.
     * PDF: uses pdf.js (loaded from CDN — free, open source).
     * DOCX/TXT/CSV: reads as text directly.
     * Returns { text: string, pageCount: number, extracted: boolean }
     */
    const ext = (file.name || '').split('.').pop().toLowerCase();

    // Plain text files
    if (['txt', 'csv', 'md'].includes(ext)) {
      const text = await readAsText(file);
      return { text, pageCount: 1, extracted: true };
    }

    // DOCX — read raw XML text (good enough for keyword analysis)
    if (['docx', 'doc'].includes(ext)) {
      try {
        const arrayBuffer = await readAsArrayBuffer(file);
        // DOCX is a ZIP — try to extract word/document.xml text
        // Without JSZip we can still extract visible strings
        const text = extractStringsFromBinary(arrayBuffer);
        return { text, pageCount: 1, extracted: true };
      } catch {
        return { text: '', pageCount: 0, extracted: false };
      }
    }

    // PDF — use pdf.js if available
    if (ext === 'pdf') {
      if (window.pdfjsLib) {
        try {
          const arrayBuffer = await readAsArrayBuffer(file);
          const pdf   = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let   text  = '';
          for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(s => s.str).join(' ') + '\n';
          }
          return { text, pageCount: pdf.numPages, extracted: true };
        } catch (e) {
          console.warn('[LocalEngine] PDF.js error:', e.message);
        }
      }
      // Fallback: extract printable ASCII strings from binary
      const ab   = await readAsArrayBuffer(file);
      const text = extractStringsFromBinary(ab);
      return { text, pageCount: 1, extracted: text.length > 100 };
    }

    return { text: '', pageCount: 0, extracted: false };
  }

  function readAsText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result);
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  }

  function extractStringsFromBinary(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let str = '', result = '';
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c < 127) {
        str += String.fromCharCode(c);
      } else {
        if (str.length >= 5) result += str + ' ';
        str = '';
      }
    }
    return result.slice(0, 50000); // cap at 50KB
  }

  // ── Keyword extraction helpers ───────────────────────────────────────────────
  function extractNumber(text, patterns) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const raw = m[1].replace(/[,$]/g, '');
        return parseFloat(raw) || null;
      }
    }
    return null;
  }

  function findKeywords(text, keywords) {
    const lc = text.toLowerCase();
    return keywords.filter(k => lc.includes(k.toLowerCase()));
  }

  function countKeywords(text, keywords) {
    return findKeywords(text, keywords).length;
  }

  // ── Document classification ──────────────────────────────────────────────────
  function classifyDocument(text, fileName, meta) {
    const lc   = text.toLowerCase();
    const name = (fileName || '').toLowerCase();

    // Detect document type by keywords
    const typeMap = [
      { type: 'audit_report',       keywords: ['audited financial', 'audit opinion', 'kpmg', 'pwc', 'deloitte', 'ernst & young', 'independent auditor'] },
      { type: 'financial_model',    keywords: ['projected revenue', 'ebitda margin', 'financial projections', 'forecast', 'irr', 'npv', 'dcf'] },
      { type: 'term_sheet',         keywords: ['term sheet', 'conditions precedent', 'representations and warranties', 'closing date', 'long stop'] },
      { type: 'legal_contract',     keywords: ['shareholder agreement', 'subscription agreement', 'shareholders deed', 'articles of association', 'memorandum'] },
      { type: 'cim',                keywords: ['confidential information memorandum', 'investment highlights', 'management team', 'market opportunity', 'executive summary'] },
      { type: 'pitch_deck',         keywords: ['series a', 'series b', 'seed round', 'runway', 'traction', 'market size', 'total addressable market'] },
      { type: 'warehouse_receipt',  keywords: ['warehouse receipt', 'afex', 'ecx', 'gcx', 'grade a', 'moisture content', 'metric tonnes'] },
      { type: 'valuation_report',   keywords: ['independent valuation', 'market value', 'capitalisation rate', 'discounted cash flow', 'comparable transactions'] },
    ];

    let best = 'other', bestScore = 0;
    for (const { type, keywords } of typeMap) {
      const score = countKeywords(lc, keywords);
      if (score > bestScore) { bestScore = score; best = type; }
    }

    const confidence = Math.min(0.5 + bestScore * 0.12, 0.97);

    // Extract company name from text
    const coPatterns = [
      /(?:company|corporation|ltd|limited|sarl|sa|plc|inc|llc)[:\s]+([A-Z][A-Za-z\s&.,]+)/,
      /([A-Z][A-Za-z\s&]+(?:Ltd|Limited|SARL|SA|Plc|Inc|LLC))/,
    ];
    let company = meta?.company_name || '';
    if (!company) {
      for (const p of coPatterns) {
        const m = text.match(p);
        if (m) { company = m[1].trim().slice(0, 60); break; }
      }
    }

    // Extract period
    const yearMatch = text.match(/\b(20[12][0-9])\b/g);
    const period    = yearMatch ? yearMatch[yearMatch.length - 1] : '2024';

    // Data quality
    const dataQuality = bestScore >= 3 ? 'high' : bestScore >= 1 ? 'medium' : 'low';

    // Key topics
    const topicKeywords = [
      'Revenue', 'EBITDA', 'IRR', 'MOIC', 'Valuation', 'Collateral',
      'Governance', 'ESG', 'Debt', 'Equity', 'Exit', 'Covenant',
      'FX', 'Currency', 'Regulatory', 'Compliance', 'KYC', 'AML',
    ];
    const topics = topicKeywords.filter(t => lc.includes(t.toLowerCase())).slice(0, 5);

    // Summary
    const firstSentences = text.replace(/\s+/g, ' ').slice(0, 400).trim();

    return {
      document_type: best,
      confidence: Math.round(confidence * 100) / 100,
      company_name: company || 'Unknown',
      period,
      data_quality: dataQuality,
      summary: firstSentences ? `${firstSentences}…` : `${best.replace(/_/g,' ')} document analysed.`,
      key_topics: topics.length ? topics : ['Investment Analysis'],
    };
  }

  // ── Financial analysis ───────────────────────────────────────────────────────
  function analyseFinancials(text, meta) {
    const lc = text.toLowerCase();

    const revenue = extractNumber(text, [
      /revenue[:\s]+\$?([\d,]+(?:\.\d+)?)\s*(?:million|m\b)?/i,
      /turnover[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
      /total\s+revenue[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    ]);

    const ebitda = extractNumber(text, [
      /ebitda[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
      /operating\s+profit[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    ]);

    const netIncome = extractNumber(text, [
      /net\s+(?:income|profit)[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
      /profit\s+after\s+tax[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    ]);

    const debt = extractNumber(text, [
      /(?:total\s+)?debt[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
      /borrowings[:\s]+\$?([\d,]+(?:\.\d+)?)/i,
    ]);

    // Calculate ratios
    const ebitdaMargin = (revenue && ebitda) ? Math.round(ebitda / revenue * 100) : null;
    const debtToEquity = (debt && revenue)   ? Math.round(debt / revenue * 10) / 10 : null;

    // Revenue growth from historical mentions
    const growthMatch = text.match(/(?:revenue\s+growth|grew|increased)[:\s]+(\d+(?:\.\d+)?)\s*%/i);
    const revenueGrowth = growthMatch ? parseFloat(growthMatch[1]) : null;

    // Red flags
    const redFlags = [];
    if (lc.includes('going concern'))    redFlags.push('Going concern note in audit opinion');
    if (lc.includes('material weakness')) redFlags.push('Material weakness in internal controls');
    if (lc.includes('restatement'))      redFlags.push('Financial restatement identified');
    if (lc.includes('qualified opinion')) redFlags.push('Qualified audit opinion');
    if (ebitdaMargin !== null && ebitdaMargin < 0) redFlags.push('Negative EBITDA margin');
    if (debtToEquity !== null && debtToEquity > 3)  redFlags.push('High leverage ratio: ' + debtToEquity + 'x');
    if (!revenue && !ebitda)              redFlags.push('No financial figures extracted — verify document quality');

    return {
      period: meta?.period || '2024',
      currency: lc.includes('ngn') || lc.includes('naira') ? 'NGN'
               : lc.includes('xaf') || lc.includes('fcfa') ? 'XAF'
               : lc.includes('kes') ? 'KES'
               : lc.includes('zar') ? 'ZAR'
               : 'USD',
      income_statement: {
        revenue:    revenue || null,
        ebitda:     ebitda  || null,
        net_income: netIncome || null,
      },
      ratios: {
        ebitda_margin_pct:  ebitdaMargin,
        revenue_growth_pct: revenueGrowth,
        debt_to_equity:     debtToEquity,
      },
      historical_data: [],
      red_flags: redFlags,
    };
  }

  // ── Legal analysis ───────────────────────────────────────────────────────────
  function analyseLegal(text, meta) {
    const lc = text.toLowerCase();

    const docType = lc.includes('shareholder') ? 'Shareholder Agreement'
                  : lc.includes('subscription') ? 'Subscription Agreement'
                  : lc.includes('term sheet')   ? 'Term Sheet'
                  : lc.includes('facility')     ? 'Facility Agreement'
                  : lc.includes('lease')        ? 'Lease Agreement'
                  : 'Legal Document';

    // Party extraction
    const parties = [];
    const partyMatch = text.match(/between[:\s]+([A-Z][A-Za-z\s,&.()]+?)(?:and|,)/i);
    if (partyMatch) parties.push(partyMatch[1].trim().slice(0, 80));
    if (lc.includes('prime alpha')) parties.push('Prime Alpha Securities');

    // Governing law
    const lawMatch = text.match(/governed\s+by[:\s]+(?:the\s+laws?\s+of\s+)?([A-Z][A-Za-z\s]+?)(?:\.|,|\n)/i);
    const governingLaw = lawMatch ? lawMatch[1].trim().slice(0, 60) : 'Not specified';

    // Risk provisions
    const riskProvisions = [];
    if (!lc.includes('drag-along') && !lc.includes('drag along'))
      riskProvisions.push('No drag-along provision identified');
    if (!lc.includes('tag-along') && !lc.includes('tag along'))
      riskProvisions.push('No tag-along provision identified');
    if (!lc.includes('non-compete') && !lc.includes('non compete'))
      riskProvisions.push('Non-compete clause not identified');
    if (!lc.includes('representations') && !lc.includes('warranties'))
      riskProvisions.push('Representations and warranties not found — verify document');

    return {
      document_type: docType,
      parties: parties.length ? parties : ['Counterparties not extracted'],
      governing_law: governingLaw,
      key_terms: {},
      risk_provisions: riskProvisions.length ? riskProvisions : ['No significant risk provisions flagged'],
      analyst_notes: `${docType} reviewed. ${parties.length ? parties.join(' and ') + ' identified as parties.' : ''} Standard due diligence review recommended.`,
    };
  }

  // ── Risk analysis ────────────────────────────────────────────────────────────
  function analyseRisk(text, meta, classification) {
    const lc = text.toLowerCase();

    // Count risk signals
    const highRiskSignals = findKeywords(lc, [
      'default', 'litigation', 'going concern', 'sanctions', 'fraud', 'corruption',
      'material weakness', 'qualified opinion', 'restatement', 'bankruptcy', 'insolvency',
      'criminal', 'money laundering', 'bribery',
    ]);

    const medRiskSignals = findKeywords(lc, [
      'concentration', 'key man', 'key-man', 'single customer', 'regulatory risk',
      'currency risk', 'fx risk', 'interest rate', 'refinancing', 'covenant breach',
      'competitive pressure', 'market risk', 'political risk', 'country risk',
    ]);

    const positiveSignals = findKeywords(lc, [
      'growth', 'profitable', 'market leader', 'diversified', 'long-term contract',
      'recurring revenue', 'audited', 'clean opinion', 'experienced management',
      'collateralised', 'secured', 'insurance', 'hedged',
    ]);

    const riskScore = Math.min(10, Math.max(1,
      3 + highRiskSignals.length * 2 + medRiskSignals.length - positiveSignals.length
    ));

    const riskLevel = riskScore <= 3 ? 'low'
                    : riskScore <= 5 ? 'medium'
                    : riskScore <= 7 ? 'high'
                    : 'critical';

    const recommendation = riskScore <= 3 ? 'proceed'
                         : riskScore <= 5 ? 'proceed_with_caution'
                         : riskScore <= 7 ? 'further_diligence_required'
                         : 'do_not_proceed';

    // Build risk flags
    const flags = [];
    if (highRiskSignals.length) {
      flags.push({
        severity: 'high',
        category: 'compliance',
        title: 'High-risk keywords detected',
        detail: `The following risk signals were identified in the document: ${highRiskSignals.slice(0,4).join(', ')}.`,
        mitigation: 'Request clarification and additional documentation on each flagged item.',
      });
    }
    if (medRiskSignals.length) {
      flags.push({
        severity: 'medium',
        category: 'market',
        title: 'Medium-risk factors identified',
        detail: `Risk factors noted: ${medRiskSignals.slice(0,3).join(', ')}.`,
        mitigation: 'Assess materiality and request management commentary.',
      });
    }
    if (!flags.length) {
      flags.push({
        severity: 'low',
        category: 'general',
        title: 'No critical risk flags identified',
        detail: 'Document text analysis did not surface critical risk keywords. Standard diligence applies.',
        mitigation: 'Proceed with standard investment committee review.',
      });
    }

    return {
      overall_risk_score:         riskScore,
      overall_risk_level:         riskLevel,
      investment_recommendation:  recommendation,
      summary: `Risk score ${riskScore}/10 (${riskLevel}). ${highRiskSignals.length} high-risk signal(s) and ${medRiskSignals.length} medium-risk factor(s) identified from document text analysis.`,
      risk_flags: flags,
      strengths: positiveSignals.slice(0, 4).map(s => s.charAt(0).toUpperCase() + s.slice(1)) || ['No specific strengths extracted'],
      diligence_gaps: [
        'Management accounts for most recent quarter',
        'Reference checks on key counterparties',
        'Independent legal review of key clauses',
      ],
    };
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  function buildSummary(classification, financials, risk) {
    const docType  = (classification?.document_type || 'document').replace(/_/g, ' ');
    const company  = classification?.company_name || 'the company';
    const rScore   = risk?.overall_risk_score || 5;
    const rLevel   = risk?.overall_risk_level  || 'medium';
    const rec      = risk?.investment_recommendation || 'further_diligence_required';

    const recLabel = {
      proceed:                    'Proceed — risk profile acceptable',
      proceed_with_caution:       'Proceed with caution — monitor key risks',
      further_diligence_required: 'Further diligence required before commitment',
      do_not_proceed:             'Do not proceed — unacceptable risk profile',
    }[rec] || rec;

    return {
      headline: `${company} — ${recLabel}`,
      executive_summary: `This ${docType} for ${company} has been reviewed. The overall risk score is ${rScore}/10 (${rLevel}). ${risk?.summary || ''} Standard investment committee review is recommended before any commitment.`,
      key_highlights: (risk?.strengths || []).slice(0, 3),
      key_concerns:   (risk?.risk_flags || []).slice(0, 3).map(f => f.title),
      next_steps: [
        'Present to Investment Committee for initial screening',
        'Commission independent legal review',
        'Request management accounts and projections',
        'Conduct reference calls with key counterparties',
      ],
    };
  }

  // ── Master analysis entry point ───────────────────────────────────────────────
  /**
   * analyseDocument(file, meta, type)
   * file: File object or null (for form-only analysis)
   * meta: { company_name, deal_name, doc_type, strategy }
   * type: 'full' | 'classification' | 'financial' | 'legal' | 'risk' | 'summary'
   * Returns the same JSON structure as the Claude API version.
   */
  async function analyseDocument(file, meta, type) {
    let text = '';
    let pageCount = 0;
    let extracted = false;

    if (file) {
      const r = await extractText(file);
      text      = r.text;
      pageCount = r.pageCount;
      extracted = r.extracted;
    }

    const classification = classifyDocument(text, file?.name, meta);
    const financials     = analyseFinancials(text, meta);
    const legal          = analyseLegal(text, meta);
    const risk           = analyseRisk(text, meta, classification);
    const summary        = buildSummary(classification, financials, risk);

    const full = { classification, financial: financials, legal, risk, summary };

    if (type === 'full')           return full;
    if (type === 'classification') return { classification };
    if (type === 'financial')      return { financial: financials };
    if (type === 'legal')          return { legal };
    if (type === 'risk')           return { risk };
    if (type === 'summary')        return { summary };
    return full;
  }

  /**
   * analyseForm(formData, strategy)
   * For intake forms — no document, pure form-data analysis.
   * Builds a text representation of the form and runs analysis.
   */
  async function analyseForm(formData, strategy) {
    // Convert form data to readable text for the analysis engine
    const lines = Object.entries(formData)
      .filter(([k, v]) => v && !['strategy','submittedAt','docName','docB64'].includes(k))
      .map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`);
    const text = lines.join('\n');

    const classification = {
      document_type: strategy + '_intake_form',
      confidence: 0.95,
      company_name: formData.co || formData.company || formData.commodity || 'Submitted Entity',
      period: new Date().getFullYear().toString(),
      data_quality: 'high',
      summary: `${strategy.toUpperCase()} deal intake form submitted by ${formData.name || 'analyst'}.`,
      key_topics: [strategy.toUpperCase(), 'Deal Intake', 'PAS Screening'],
    };

    const risk    = analyseRisk(text, formData, classification);
    const summary = buildSummary(classification, {}, risk);

    // For credit forms, apply the internal grading logic
    let creditGrade = null;
    if (strategy === 'credit') {
      creditGrade = gradeCreditRisk(formData);
      if (creditGrade) {
        risk.credit_grade     = creditGrade.grade;
        risk.pd_range         = creditGrade.pd_range;
        risk.suggested_rate   = creditGrade.rate;
        summary.headline      = `${classification.company_name} — Credit Grade ${creditGrade.grade} — ${creditGrade.rate_label}`;
      }
    }

    return { classification, risk, summary, credit_grade: creditGrade };
  }

  // ── Credit grading (mirrors the intake form credit engine) ───────────────────
  function gradeCreditRisk(d) {
    const rev    = parseFloat(d['cr-rev'] || d.rev || 0);
    const ebitda = parseFloat(d['cr-ebitda'] || d.ebitda || 0);
    const debt   = parseFloat(d['cr-debt'] || d.debt || 0);
    const ds     = parseFloat(d['cr-ds'] || d.ds || 0);
    const amount = parseFloat(d['cr-amount'] || d.amount || 0);

    if (!amount) return null;

    const dscr        = ds > 0 ? (ebitda / ds) : null;
    const ebitdaMargin = rev > 0 ? ebitda / rev : 0;
    const leverage    = rev > 0 ? debt / rev : 0;

    let score = 5; // start neutral
    if (dscr !== null) {
      if (dscr >= 2.5) score -= 2;
      else if (dscr >= 1.5) score -= 1;
      else if (dscr < 1.2) score += 2;
      else if (dscr < 1.0) score += 3;
    }
    if (ebitdaMargin > 0.20) score -= 1;
    if (ebitdaMargin < 0.05) score += 1;
    if (leverage > 2) score += 1;
    if (leverage > 4) score += 1;

    score = Math.max(1, Math.min(10, score));

    const GRADES = [
      { min:1, max:1, grade:'G1', pd:'1–2%',   rate: '12–14%', label:'Excellent — Prime rate' },
      { min:2, max:2, grade:'G2', pd:'2–4%',   rate: '14–16%', label:'Strong' },
      { min:3, max:3, grade:'G3', pd:'4–7%',   rate: '16–19%', label:'Good' },
      { min:4, max:4, grade:'G4', pd:'7–12%',  rate: '19–22%', label:'Acceptable' },
      { min:5, max:5, grade:'G5', pd:'12–18%', rate: '22–26%', label:'Borderline' },
      { min:6, max:6, grade:'G6', pd:'18–25%', rate: '26–32%', label:'Weak' },
      { min:7, max:7, grade:'G7', pd:'25–35%', rate: '32–38%', label:'Speculative' },
      { min:8, max:8, grade:'G8', pd:'35–50%', rate: '38–45%', label:'High risk' },
      { min:9, max:9, grade:'G9', pd:'50–70%', rate: '45–55%', label:'Very high risk' },
      { min:10,max:10,grade:'G10',pd:'70–100%',rate: '55%+',   label:'Extreme risk' },
    ];

    const g = GRADES.find(r => score >= r.min && score <= r.max) || GRADES[4];
    return {
      grade:      g.grade,
      pd_range:   g.pd,
      rate:       g.rate,
      rate_label: g.label,
      score,
      dscr:       dscr ? Math.round(dscr * 100) / 100 : null,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return { analyseDocument, analyseForm, extractText, gradeCreditRisk };

})();
