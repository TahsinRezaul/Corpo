// ── Help content for every page in CORPO ──────────────────────────────────────
// Used by the PageHelp component (? button in each page header).

export type HelpContent = {
  pageId: string;
  title: string;
  subtitle: string;
  about: string;
  howItWorks: string[];
  keyConcepts?: { term: string; def: string }[];
  whyEmpty?: string;
  tips: string[];
};

export const PAGE_HELP: Record<string, HelpContent> = {

  receipts: {
    pageId: "receipts",
    title: "Receipts",
    subtitle: "Business expense tracking",
    about:
      "The Receipts page is where you log every business purchase your corporation makes. " +
      "Upload a photo of a receipt (or enter it manually) and CORPO extracts the vendor, amount, date, tax, and category automatically using AI. " +
      "These records feed into your HST report, P&L, shareholder loan tracker, and accountant package.",
    howItWorks: [
      "Tap + or Import to add a receipt",
      "AI (Claude or Google Document AI) reads the receipt and fills in the fields",
      "Review and confirm the details — especially the category",
      "Saved receipts appear in your expense reports and HST report (as Input Tax Credits)",
      "If marked as 'Shareholder Loan', it auto-posts to your loan ledger",
    ],
    keyConcepts: [
      { term: "Input Tax Credits (ITCs)", def: "The HST you paid on business purchases. You claim this back from the CRA on your HST return." },
      { term: "Category", def: "How the expense is classified on your T2 (corporate tax return). Examples: Office Expenses, Travel, Meals & Entertainment." },
      { term: "Shareholder Loan", def: "If you paid for a business expense with your personal money, toggle this. It means the company owes you that money." },
      { term: "Tax Deductible", def: "Whether this expense reduces your taxable income. Most business expenses are deductible." },
    ],
    whyEmpty:
      "No receipts yet — tap the + button or go to Import to upload receipts. " +
      "Once you add receipts, they show here and automatically flow into your HST Report and P&L.",
    tips: [
      "Photograph receipts immediately — faded receipts fail OCR",
      "Meals & Entertainment are only 50% deductible for tax purposes",
      "Always set a business purpose so you're audit-ready",
      "Recurring subscriptions (e.g. software) can be set as recurring",
    ],
  },

  invoices: {
    pageId: "invoices",
    title: "Invoices",
    subtitle: "Create and manage client invoices",
    about:
      "The Invoices page lets you create professional PDF invoices for your clients, track payment status (unpaid, partial, paid), " +
      "and log income at the same time. When you mark an invoice paid, the income is recorded in your P&L. " +
      "HST (13% for Ontario) is calculated automatically and tracked for your HST return.",
    howItWorks: [
      "Click New Invoice to create one",
      "Enter your client's name, services/items, and rates",
      "CORPO calculates subtotal, HST (13%), and total",
      "Export as a PDF to send to your client",
      "Mark as Paid when payment is received — income is recorded automatically",
    ],
    keyConcepts: [
      { term: "HST Number", def: "Your CRA-assigned tax registration number (starts with 9 digits). Required on invoices once you earn $30,000+/year." },
      { term: "Net 30", def: "Payment is due 30 days from invoice date. You can set your default payment terms in Settings." },
      { term: "Status: Unpaid / Partial / Paid", def: "Tracks whether your client has paid. Only 'Paid' invoices count in your P&L." },
    ],
    whyEmpty:
      "No invoices yet. Click 'New Invoice' to create your first one. " +
      "Set up your business profile in Settings → Invoices so your name, address, and HST number appear on PDFs.",
    tips: [
      "Add your HST number and business address in Settings → Invoices",
      "Use invoice templates for recurring clients",
      "Always include a due date to get paid faster",
      "Unpaid invoices older than 90 days are highlighted for easy follow-up",
    ],
  },

  income: {
    pageId: "income",
    title: "Income & P&L",
    subtitle: "Revenue tracking and profit overview",
    about:
      "The Income & P&L page tracks all money coming into your corporation — either imported from invoices you mark paid, " +
      "or entered manually. It shows your total revenue, HST collected, and a simple Profit & Loss (P&L) statement. " +
      "P&L = Total Revenue − Total Expenses − Mileage Deduction.",
    howItWorks: [
      "Income entries are added when you mark an invoice as Paid",
      "Or you can add income manually with the + button",
      "The P&L summary pulls expenses from Receipts and mileage from Mileage Log",
      "Filter by year to see annual or monthly summaries",
    ],
    keyConcepts: [
      { term: "Revenue (excl. HST)", def: "The actual money earned — before adding the HST your client paid. This is your business income." },
      { term: "HST Collected", def: "The 13% tax your clients paid on top of your fee. You owe this to the CRA (offset by ITCs from expenses)." },
      { term: "Net Income", def: "Revenue minus all deductible expenses. This is what your corporation is taxed on." },
      { term: "P&L (Profit & Loss)", def: "A simple financial statement: how much you earned minus how much you spent." },
    ],
    whyEmpty:
      "No income entries yet. Either: (1) Go to Invoices and mark an invoice as 'Paid' — it'll appear here automatically, " +
      "or (2) Use the + button to manually add an income entry.",
    tips: [
      "Revenue is entered WITHOUT HST — HST is tracked separately",
      "Pay yourself through salary or dividends, not 'income withdrawal'",
      "Your net income here is what gets taxed at the corporate rate (~15–26%)",
    ],
  },

  mileage: {
    pageId: "mileage",
    title: "Mileage Log",
    subtitle: "CRA-compliant vehicle trip tracking",
    about:
      "The Mileage Log tracks every business trip you take. " +
      "Enter your start and end addresses and CORPO automatically calculates the distance using Google Maps. " +
      "At year end, the CRA allows you to deduct $0.70/km (first 5,000 km) and $0.64/km (after) as a tax deduction.",
    howItWorks: [
      "Tap + to log a new trip — enter From and To addresses",
      "Google Maps calculates the exact distance automatically",
      "Add a business purpose (required for CRA audit)",
      "All trips accumulate — CORPO calculates your total deduction",
      "Export your mileage log for your accountant via Accountant Reports",
    ],
    keyConcepts: [
      { term: "CRA Mileage Rate", def: "For 2024: $0.70/km for the first 5,000 km, then $0.64/km. This is the amount per km your corporation can deduct." },
      { term: "Business Purpose", def: "Required by the CRA — a brief note like 'Client meeting at [client name]' or 'Bank — payroll'. Keep it honest and specific." },
      { term: "Round Trip", def: "Toggle on if you drove there and back. CORPO doubles the distance automatically." },
    ],
    whyEmpty:
      "No trips logged yet. Tap the + button and enter a From address, To address, and business purpose. " +
      "Tip: set your home or office address in Settings → Mileage so it auto-fills.",
    tips: [
      "Log trips immediately — it's easy to forget later",
      "Personal trips (grocery runs, commuting) are NOT deductible",
      "Set your office location in Settings so it auto-fills the From address",
      "You can import historical trips from a spreadsheet via Import/Migrate",
    ],
  },

  hst: {
    pageId: "hst",
    title: "HST / GST Report",
    subtitle: "Quarterly and annual tax filing summary",
    about:
      "The HST Report calculates exactly how much HST (Harmonized Sales Tax) you owe to the CRA — or how much they owe you. " +
      "It pulls HST Collected from your income entries and HST Paid (Input Tax Credits) from your receipts. " +
      "File this using CRA My Business Account or GST/HST NETFILE.",
    howItWorks: [
      "HST Collected comes from your invoices / income entries",
      "HST Paid (ITCs) comes from your receipt tax fields",
      "Net HST = Collected minus ITCs — this is what you file with the CRA",
      "Switch between Quarterly and Annual view to match your filing frequency",
      "Filing deadlines are shown at the bottom for each quarter",
    ],
    keyConcepts: [
      { term: "HST Collected", def: "The 13% tax you charged your clients. You hold it temporarily and remit it to the CRA." },
      { term: "Input Tax Credits (ITCs)", def: "The HST you paid on business purchases. The CRA lets you deduct this from what you owe." },
      { term: "Net HST Owing", def: "HST Collected minus ITCs. Positive = you owe the CRA. Negative = the CRA owes you a refund." },
      { term: "Filing Frequency", def: "How often you file: Annually (under $1.5M/yr revenue), Quarterly ($1.5M–$6M), or Monthly ($6M+)." },
      { term: "NETFILE", def: "The CRA's online system for submitting your HST/GST return. Free to use at canada.ca." },
    ],
    whyEmpty:
      "Showing $0? This is because no income or expense data exists yet for the selected period. " +
      "To see HST Collected: add income entries in Income & P&L (or mark invoices as Paid). " +
      "To see ITCs: add receipts in the Receipts page and include the tax (HST) amount on each one. " +
      "Once you have data, this report fills in automatically for the selected year/quarter.",
    tips: [
      "Most small Ontario CCPCs file quarterly — due dates are Apr 30, Jul 31, Oct 31, Jan 31",
      "You must register for HST once you earn $30,000 in any 12-month period",
      "Always keep receipts — they're proof of your ITCs if the CRA audits you",
      "If you get a refund, claim it — the CRA won't remind you",
    ],
  },

  money: {
    pageId: "money",
    title: "Money Management",
    subtitle: "Corporate cash flow planning",
    about:
      "Money Management helps you understand how much of your corporate cash is available, " +
      "how much to set aside for taxes, and how to plan salary vs. dividend vs. keep-in-corp splits. " +
      "It shows your current estimated tax obligations so you're never surprised at year end.",
    howItWorks: [
      "Shows your net corporate income (revenue minus expenses)",
      "Calculates how much to set aside for corporate tax (~15%)",
      "Models different salary/dividend splits for tax planning",
      "Remaining cash after taxes and compensation is 'Keep in Corp'",
    ],
    keyConcepts: [
      { term: "Corporate Tax Rate", def: "For Ontario CCPCs on active business income under $500K: ~15.5% (9% federal small biz + ~3.2% ON) — the lowest tax rate available." },
      { term: "Salary", def: "Paid to you as an employee of your corporation. Creates RRSP room and CPP contributions, but taxed at personal rates." },
      { term: "Dividends", def: "Paid from after-tax corporate profits. Lower personal tax rate due to the dividend tax credit, but no RRSP room." },
      { term: "Keep in Corp", def: "Leaving money inside your corporation — useful for investments, equipment purchases, or deferring personal taxes." },
    ],
    whyEmpty:
      "Showing zeros because no income or expense data has been entered yet. " +
      "Add income in Income & P&L and receipts in Receipts to see meaningful numbers here.",
    tips: [
      "Talk to an accountant before deciding on salary vs. dividend mix",
      "Keeping money in corp is a tax deferral strategy — not tax-free",
      "CPP premiums are required if you pay yourself a salary",
    ],
  },

  loan: {
    pageId: "loan",
    title: "Shareholder Loan",
    subtitle: "Track money between you and your corporation",
    about:
      "The Shareholder Loan ledger tracks money flowing between you (the shareholder/owner) and your corporation. " +
      "When you pay a business expense with personal money, the company owes you (a debit). " +
      "When you take money from the company for personal use, you owe the company (a credit). " +
      "This balance matters for taxes — if you owe the corporation money at year-end, the CRA may tax it as income.",
    howItWorks: [
      "Receipts marked 'Shareholder Loan' auto-post as debits (company owes you)",
      "Use the + button to manually add credits (personal drawings) or debits",
      "The running balance shows the net amount owed",
      "Positive balance = company owes you. Negative = you owe the company",
    ],
    keyConcepts: [
      { term: "Debit (Company owes you)", def: "You paid a business expense with your personal money. The company should reimburse you." },
      { term: "Credit (You owe the company)", def: "You took money out of the company for personal use. Must be repaid or reported as income/dividend." },
      { term: "Section 15 of the Income Tax Act", def: "If you owe the corporation money at year end and don't repay within 1 year, the CRA taxes the full amount as personal income." },
    ],
    whyEmpty:
      "No loan entries yet. They are added automatically when you mark a receipt as 'Shareholder Loan'. " +
      "You can also add manual entries with the + button.",
    tips: [
      "Keep this balance near zero — large unpaid balances attract CRA attention",
      "Document all shareholder loans with a signed loan agreement",
      "Repaying the loan within the fiscal year avoids the Section 15 tax rule",
    ],
  },

  tax: {
    pageId: "tax",
    title: "Tax Planner",
    subtitle: "Year-end corporate tax estimate",
    about:
      "The Tax Planner estimates how much tax you will owe at year end and helps you choose the best split between " +
      "salary, dividends, and keeping money in the corporation. " +
      "It uses Claude AI to answer questions about your specific tax situation.",
    howItWorks: [
      "Pulls your actual revenue, expenses, and mileage from other modules",
      "Estimates corporate taxable income after deductions",
      "Models different salary/dividend/keep-in-corp splits",
      "Shows personal tax implications of each option",
      "AI chat answers your specific tax questions using your real numbers",
    ],
    keyConcepts: [
      { term: "Corporate Tax", def: "Tax paid by the corporation on its profits. Ontario CCPC small biz rate: ~15.5% on first $500K." },
      { term: "Personal Tax (Salary)", def: "Personal income tax on the salary you pay yourself. Graduated rates — higher income = higher rate." },
      { term: "Dividend Tax Credit", def: "A credit that reduces personal tax on dividends from a Canadian corporation. Reduces the 'double taxation' effect." },
      { term: "Integration", def: "The Canadian tax system is designed so salary and dividends roughly result in the same total tax. In practice, the optimal mix depends on your situation." },
    ],
    whyEmpty:
      "Numbers showing as zero or estimates seem low? Make sure you've added income in Income & P&L and expenses in Receipts. " +
      "The tax planner uses your actual data to project year-end tax.",
    tips: [
      "Review your tax plan in October/November — you still have time to adjust",
      "Paying yourself a salary creates RRSP room for the following year",
      "Ask the AI assistant your specific questions — it knows your actual numbers",
    ],
  },

  accountant: {
    pageId: "accountant",
    title: "Accountant Reports",
    subtitle: "Downloadable documents for your accountant",
    about:
      "The Accountant Reports page compiles all your financial data into clean, print-ready documents " +
      "you can email or print for your accountant. " +
      "This saves them hours of work organizing your numbers — and saves you money on accounting fees. " +
      "Use the 'Print / Save PDF' button to export any tab as a PDF.",
    howItWorks: [
      "Select the tax year using the year dropdown",
      "Choose a tab: Summary, Expenses, or Full Package",
      "Click 'Print / Save PDF' to download or print",
      "Email the PDF to your accountant before your year-end meeting",
    ],
    keyConcepts: [
      { term: "Tax Year Summary", def: "A one-page overview of income, expenses, mileage, HST, and estimated net income." },
      { term: "Categorized Expenses", def: "All receipts grouped by T2 tax category — exactly what your accountant needs for Schedule 1." },
      { term: "Full Accountant Package", def: "Everything in one PDF: summary + expenses + mileage log + notes. The most complete option." },
    ],
    whyEmpty:
      "Showing zeros because no data has been entered yet for the selected year. " +
      "Add receipts, income entries, and mileage trips first — then this page will populate automatically.",
    tips: [
      "Send the Full Package to your accountant — it has everything they need",
      "Select the correct tax year in the dropdown before exporting",
      "Your accountant still needs to verify figures and file the T2 — this just makes it faster",
      "T2 Prep Sheet, T4 Slips, and CRA Filing Checklist are coming in future updates",
    ],
  },

  settings: {
    pageId: "settings",
    title: "Settings",
    subtitle: "Configure CORPO for your business",
    about:
      "Settings lets you customize CORPO for your specific corporation — province, fiscal year end, invoice defaults, " +
      "mileage rates, and more. " +
      "Most fields have sensible defaults for Ontario CCPCs, but you should review them once when you first set up the app.",
    howItWorks: [
      "General: date format, province, fiscal year end",
      "Invoices: your business name, HST number, default payment terms",
      "Receipts: default category for new receipts",
      "Mileage: CRA rate per km, address geocoding bias",
      "Tax: province for tax calculations, tax planner defaults",
      "AI: enable Pro Mode for AI to make direct changes to your data",
    ],
    keyConcepts: [
      { term: "Fiscal Year End", def: "The last day of your corporation's tax year. Default is December 31. CCPCs can choose any date." },
      { term: "HST Number", def: "Your CRA-assigned tax registration number. Required on invoices if you earn $30,000+/year. Starts with a 9-digit business number." },
      { term: "Location Bias", def: "Biases address autocomplete towards your main business area so searches are more relevant. Default is Greater Toronto Area." },
    ],
    tips: [
      "Set up your business profile in Invoices tab first — it appears on all PDFs",
      "Your HST number is 9 digits followed by RT0001 (e.g. 123456789 RT0001)",
      "If you cross multiple provinces, turn off Location Bias in Mileage settings",
    ],
  },

};
