// ---------- SERVER ACTIONS ----------

// --- Perpetual Debt Tracking Actions ---
async function payDebt(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)
  
  const debtId = formData.get('id') as string
  const monthId = formData.get('monthId') as string
  const amountPaid = Number(formData.get('amountPaid') ?? 0)
  
  if (amountPaid <= 0) return;

  const { data: existing } = await supabase.from('debt_payments').select('*').match({ debt_id: debtId, paid_month: monthId }).single()
  
  if (existing) {
    // Tambah nilai pada bayaran sedia ada
    await supabase.from('debt_payments').update({ amount_paid: Number(existing.amount_paid ?? 0) + amountPaid }).match({ debt_id: debtId, paid_month: monthId })
  } else {
    // Masukkan rekod bayaran baharu
    await supabase.from('debt_payments').insert({ 
      debt_id: debtId, 
      paid_month: monthId,
      amount_paid: amountPaid
    })
  }
  revalidatePath('/')
}

async function undoDebtPayment(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)
  
  const debtId = formData.get('id') as string
  const monthId = formData.get('monthId') as string
  
  await supabase.from('debt_payments').delete().match({ debt_id: debtId, paid_month: monthId })
  revalidatePath('/')
}

async function updateDebtBalances(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  const creditor = formData.get('creditor') as string
  const arrears = Number(formData.get('arrears') ?? 0)
  const float = Number(formData.get('float') ?? 0)
  const monthly_due = Number(formData.get('monthly_due') ?? 0)
  const original_loan_amount = Number(formData.get('original_loan_amount') ?? 0)
  const total_debt_amount = Number(formData.get('total_debt_amount') ?? 0)

  let start_date = formData.get('start_date') as string || null;
  let end_date = formData.get('end_date') as string || null;
  let financing_tenure = Number(formData.get('financing_tenure')) || null;

  // Auto-calculate Tenure based on Limit/Base if missing
  if (!financing_tenure && monthly_due > 0 && original_loan_amount > 0) {
      financing_tenure = Math.ceil(original_loan_amount / monthly_due);
  }
  
  // Auto-calculate End Date based on Start Date + Tenure if missing
  if (start_date && financing_tenure && !end_date) {
      const d = new Date(start_date);
      d.setMonth(d.getMonth() + financing_tenure);
      end_date = d.toISOString().split('T')[0];
  }

  await supabase.from('debts').update({ 
    creditor, 
    arrears_balance: arrears, 
    float_balance: float,
    monthly_due,
    original_loan_amount,
    total_debt_amount,
    start_date,
    end_date,
    financing_tenure
  }).eq('id', id)
  revalidatePath('/')
}

async function addDebt(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const creditor = formData.get('creditor') as string
  const monthly_due = Number(formData.get('monthly_due') ?? 0)
  const original_loan_amount = Number(formData.get('original_loan_amount') ?? 0)

  let start_date = formData.get('start_date') as string || null;
  let end_date = formData.get('end_date') as string || null;
  let financing_tenure = Number(formData.get('financing_tenure')) || null;

  if (!financing_tenure && monthly_due > 0 && original_loan_amount > 0) {
      financing_tenure = Math.ceil(original_loan_amount / monthly_due);
  }
  if (start_date && financing_tenure && !end_date) {
      const d = new Date(start_date);
      d.setMonth(d.getMonth() + financing_tenure);
      end_date = d.toISOString().split('T')[0];
  }
  
  await supabase.from('debts').insert({ 
    creditor, 
    monthly_due, 
    original_loan_amount,
    total_debt_amount: original_loan_amount,
    arrears_balance: 0, 
    float_balance: 0,
    is_paid: false,
    start_date,
    end_date,
    financing_tenure
  })
  revalidatePath('/')
}

async function removeDebt(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  await supabase.from('debts').delete().eq('id', id)
  revalidatePath('/')
}

async function removeBudget(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  await supabase.from('budgets').delete().eq('id', id)
  revalidatePath('/')
}

// --- Dynamic Budget Transaction & Virement Sub-Actions ---
async function executeBudgetAction(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const budgetId = formData.get('budgetId') as string
  const amount = Number(formData.get('amount') ?? 0)
  const actionType = formData.get('actionType') as string // 'spent', 'add', 'reduce'
  const currentAllocated = Number(formData.get('currentAllocated') ?? 0)
  const currentSpent = Number(formData.get('currentSpent') ?? 0)

  if (amount <= 0 || !budgetId) return

  // 1. Log the transaction in the sub-ledger
  await supabase.from('budget_transactions').insert({
    budget_id: budgetId,
    amount: amount,
    transaction_type: actionType
  })

  // 2. Perform math modifications based on tactical selection
  if (actionType === 'spent') {
    const newSpent = currentSpent + amount
    await supabase.from('budgets').update({ spent_amount: newSpent }).eq('id', budgetId)
  } else if (actionType === 'add') {
    const newAllocation = currentAllocated + amount
    await supabase.from('budgets').update({ allocated_amount: newAllocation }).eq('id', budgetId)
  } else if (actionType === 'reduce') {
    const newAllocation = Math.max(0, currentAllocated - amount)
    await supabase.from('budgets').update({ allocated_amount: newAllocation }).eq('id', budgetId)
  }

  revalidatePath('/')
}

// --- Direct Pool Cash Inflow Actions ---
async function addCashInflow(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const monthId = formData.get('monthId') as string
  const particular = formData.get('particular') as string
  const amount = Number(formData.get('amount') ?? 0)

  if (amount <= 0 || !particular) return

  await supabase.from('cash_inflows').insert({
    month_id: monthId,
    particular: particular,
    amount: amount
  })

  revalidatePath('/')
}

// --- Centralized Ledger Amend & Delete Log Actions ---
async function deleteLogEntry(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)
  
  const id = formData.get('id') as string;
  const source = formData.get('source') as string;
  
  if (source === 'budget') {
    const { data: trx } = await supabase.from('budget_transactions').select('*').eq('id', id).single();
    if (trx) {
       const { data: b } = await supabase.from('budgets').select('*').eq('id', trx.budget_id).single();
       if (b) {
         if (trx.transaction_type === 'spent') {
            await supabase.from('budgets').update({ spent_amount: Number(b.spent_amount) - Number(trx.amount) }).eq('id', b.id);
         } else if (trx.transaction_type === 'add') {
            await supabase.from('budgets').update({ allocated_amount: Number(b.allocated_amount) - Number(trx.amount) }).eq('id', b.id);
         } else if (trx.transaction_type === 'reduce') {
            await supabase.from('budgets').update({ allocated_amount: Number(b.allocated_amount) + Number(trx.amount) }).eq('id', b.id);
         }
       }
       await supabase.from('budget_transactions').delete().eq('id', id);
    }
  } else if (source === 'transfer') {
    await supabase.from('liquidity_transfers').delete().eq('id', id);
  } else if (source === 'inflow') {
    await supabase.from('cash_inflows').delete().eq('id', id);
  } else if (source === 'debt') {
    const debt_id = formData.get('raw_debt_id') as string;
    const paid_month = formData.get('raw_paid_month') as string;
    await supabase.from('debt_payments').delete().match({ debt_id, paid_month });
  } else if (source === 'bskl') {
    const contract_id = formData.get('raw_contract_id') as string;
    const paid_date = formData.get('raw_paid_date') as string;
    await supabase.from('bskl_payments').delete().match({ contract_id, paid_date });
  }
  
  revalidatePath('/')
}

async function amendLogEntry(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)
  
  const id = formData.get('id') as string;
  const source = formData.get('source') as string;
  const newAmount = Number(formData.get('amount') ?? 0);
  
  if (source === 'budget' && newAmount >= 0) {
    const { data: trx } = await supabase.from('budget_transactions').select('*').eq('id', id).single();
    if (trx) {
       const diff = newAmount - Number(trx.amount);
       const { data: b } = await supabase.from('budgets').select('*').eq('id', trx.budget_id).single();
       if (b) {
         if (trx.transaction_type === 'spent') {
            await supabase.from('budgets').update({ spent_amount: Number(b.spent_amount) + diff }).eq('id', b.id);
         } else if (trx.transaction_type === 'add') {
            await supabase.from('budgets').update({ allocated_amount: Number(b.allocated_amount) + diff }).eq('id', b.id);
         } else if (trx.transaction_type === 'reduce') {
            await supabase.from('budgets').update({ allocated_amount: Number(b.allocated_amount) - diff }).eq('id', b.id);
         }
       }
       await supabase.from('budget_transactions').update({ amount: newAmount }).eq('id', id);
    }
  } else if (source === 'transfer' && newAmount >= 0) {
    await supabase.from('liquidity_transfers').update({ amount: newAmount }).eq('id', id);
  } else if (source === 'inflow' && newAmount >= 0) {
    await supabase.from('cash_inflows').update({ amount: newAmount }).eq('id', id);
  }
  revalidatePath('/')
}

async function updateBudgetSettings(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  const category = formData.get('category') as string
  const allocated = Number(formData.get('allocated') ?? 0)
  await supabase.from('budgets').update({ category, allocated_amount: allocated }).eq('id', id)
  revalidatePath('/')
}

async function sendToSavings(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  await supabase.from('budgets').update({ is_saved: true }).eq('id', id)
  revalidatePath('/')
}

async function undoSavings(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  await supabase.from('budgets').update({ is_saved: false }).eq('id', id)
  revalidatePath('/')
}

async function addBudget(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const category = formData.get('category') as string
  const allocated_amount = Number(formData.get('allocated_amount') ?? 0)
  const budget_month = formData.get('budget_month') as string

  await supabase.from('budgets').insert({ 
    category, 
    allocated_amount, 
    budget_month,
    spent_amount: 0,
    is_saved: false
  })
  revalidatePath('/')
}

async function duplicatePreviousBudgets(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const currentMonth = formData.get('currentMonth') as string;
  const prevMonth = formData.get('prevMonth') as string;

  const { data: oldBudgets } = await supabase.from('budgets').select('*').eq('budget_month', prevMonth);
  
  if (oldBudgets && oldBudgets.length > 0) {
     const newBudgets = oldBudgets.map((b: any) => ({
       category: b.category,
       allocated_amount: b.allocated_amount,
       budget_month: currentMonth,
       spent_amount: 0,
       is_saved: false
     }));
     await supabase.from('budgets').insert(newBudgets);
  }
  revalidatePath('/');
}

async function transferFromPool(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const monthId = formData.get('monthId') as string
  const amount = Number(formData.get('amount') ?? 0)
  if (amount <= 0) return;
  
  await supabase.from('liquidity_transfers').insert({ month_id: monthId, amount })
  revalidatePath('/')
}

// --- BSKL Investment Server Actions (Holidays & Contracts) ---
async function addBsklContract(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const name = formData.get('name') as string
  const capital = Number(formData.get('capital') ?? 0)
  const rate = Number(formData.get('rate') ?? 0)
  const effectiveDate = formData.get('effectiveDate') as string

  await supabase.from('bskl_contracts').insert({
    name,
    capital_injection: capital,
    daily_rate: rate,
    effective_date: effectiveDate,
    is_active: true
  })
  revalidatePath('/')
}

async function updateBsklContract(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const capital = Number(formData.get('capital') ?? 0)
  const rate = Number(formData.get('rate') ?? 0)
  const effectiveDate = formData.get('effectiveDate') as string

  await supabase.from('bskl_contracts').update({
    name,
    capital_injection: capital,
    daily_rate: rate,
    effective_date: effectiveDate
  }).eq('id', id)
  revalidatePath('/')
}

async function endBsklContract(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  const endDate = new Date().toISOString().split('T')[0] 
  
  await supabase.from('bskl_contracts').update({ 
    is_active: false, 
    end_date: endDate 
  }).eq('id', id)
  revalidatePath('/')
}

async function toggleBsklPayment(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const contractId = formData.get('contract_id') as string
  const dateStr = formData.get('date') as string
  const amount = Number(formData.get('amount') ?? 0)
  const isPaid = formData.get('isPaid') === 'true'
  
  if (isPaid) {
    await supabase.from('bskl_payments').delete().match({ contract_id: contractId, paid_date: dateStr })
  } else {
    await supabase.from('bskl_payments').insert({ contract_id: contractId, paid_date: dateStr, amount })
  }
  revalidatePath('/')
}

async function addBsklHoliday(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const dateStr = formData.get('date') as string
  const description = formData.get('description') as string
  await supabase.from('bskl_holidays').insert({ holiday_date: dateStr, description })
  revalidatePath('/')
}

async function removeBsklHoliday(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const id = formData.get('id') as string
  await supabase.from('bskl_holidays').delete().eq('id', id)
  revalidatePath('/')
}

// --- Checking Account / Salary Server Actions ---
async function updateSalary(formData: FormData) {
  'use server'
  const supabasePath = "./supabase"
  const cachePath = "next/cache"
  const { supabase } = await import(supabasePath)
  const { revalidatePath } = await import(cachePath)

  const monthId = formData.get('monthId') as string
  const amount = Number(formData.get('amount') ?? 0)
  await supabase.from('monthly_salary').upsert({ month_id: monthId, salary_amount: amount })
  revalidatePath('/')
}

// ---------- MAIN PAGE COMPONENT ----------
export default async function Home(props: any = {}) {
  const resolvedParams = props && props.searchParams ? props.searchParams : {};
  let sp: any = {};
  if (resolvedParams) {
    try {
      sp = typeof resolvedParams.then === 'function' ? await resolvedParams : resolvedParams;
    } catch (e) {
      sp = {};
    }
  }
  if (!sp) sp = {};

  const currentSelectedMonth = sp.month || '2026-06-01'
  const currentMonthId = currentSelectedMonth.substring(0, 7)
  const expandedDebtId = sp.details
  const bsklModalDate = sp.bsklModal 
  const isLogOpen = sp.log === 'true'
  const editLogId = sp.editLog
  const n = (v: any) => Number(v ?? 0)

  let isReadOnly = false;
  let debts: any[] = [];
  let allDebtPayments: any[] = [];
  let budgets: any[] = [];
  let allBudgetsOfYear: any[] = [];
  let budgetTransactions: any[] = [];
  let transfers: any[] = [];
  let bsklContracts: any[] = [];
  let bsklPayments: any[] = [];
  let bsklHolidays: any[] = [];
  let cashInflows: any[] = [];
  let currentSalary = 0;

  try {
    const headersPath = "next/headers"
    const ssrPath = "@supabase/ssr"
    const supabasePath = "./supabase"

    const modHeaders = await import(headersPath).catch(() => null);
    const modSsr = await import(ssrPath).catch(() => null);
    const modSupabase = await import(supabasePath).catch(() => null);

    if (modHeaders && modSsr && modSupabase) {
      const cookieStore = await modHeaders.cookies()
      const { createServerClient } = modSsr
      const { supabase } = modSupabase

      const supabaseServer = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'dummy',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy',
        {
          cookies: {
            getAll() { return cookieStore.getAll() },
          },
        }
      )

      const authUserResult = await supabaseServer.auth.getUser().catch(() => ({ data: { user: null } }));
      const user = authUserResult?.data?.user;
      isReadOnly = user?.email === 'viewer@financepulse.com'

      const [
        { data: d1 }, { data: d2 }, { data: d3 }, { data: d4 }, 
        { data: d5 }, { data: d6 }, { data: d7 }, { data: d8 }, { data: d9 }, { data: d10 }, { data: d11 }
      ] = await Promise.all([
        supabase.from('debts').select('*').order('is_akpk_obligation', { ascending: false }),
        supabase.from('debt_payments').select('*'),
        supabase.from('budgets').select('*').eq('budget_month', currentSelectedMonth).order('allocated_amount', { ascending: false }),
        supabase.from('budgets').select('*'),
        supabase.from('liquidity_transfers').select('*'),
        supabase.from('bskl_contracts').select('*').order('effective_date', { ascending: true }),
        supabase.from('bskl_payments').select('*'),
        supabase.from('bskl_holidays').select('*').order('holiday_date', { ascending: true }),
        supabase.from('monthly_salary').select('*').eq('month_id', currentMonthId).single(),
        supabase.from('budget_transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('cash_inflows').select('*').order('created_at', { ascending: false })
      ]);

      if (d1) debts = d1;
      if (d2) allDebtPayments = d2;
      if (d3) budgets = d3;
      if (d4) allBudgetsOfYear = d4;
      if (d5) transfers = d5;
      if (d6) bsklContracts = d6;
      if (d7) bsklPayments = d7;
      if (d8) bsklHolidays = d8;
      if (d9) currentSalary = Number(d9.salary_amount);
      if (d10) budgetTransactions = d10;
      if (d11) cashInflows = d11;
    }
  } catch (error) {
    // Canvas rendering protection
  }
  
  const isEditing = !isReadOnly && sp.edit === 'true'

  // Calendar Engines
  const year = parseInt(currentSelectedMonth.split('-')[0]);
  const monthIndex = parseInt(currentSelectedMonth.split('-')[1]) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay();

  const prevMonthDate = new Date(year, monthIndex - 1, 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthLabel = prevMonthDate.toLocaleDateString('en-MY', { month: 'short', year: 'numeric' }).toUpperCase();

  const nextMonthDate = new Date(year, monthIndex + 1, 1);
  const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonthLabel = nextMonthDate.toLocaleDateString('en-MY', { month: 'short', year: 'numeric' }).toUpperCase();

  const historyMonths: { label: string; monthId: string; yearStr: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(year, monthIndex - i, 1);
    historyMonths.push({
      label: d.toLocaleDateString('en-MY', { month: 'short' }),
      monthId: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      yearStr: d.getFullYear().toString()
    });
  }
  const histFirstYear = historyMonths[0].yearStr;
  const histLastYear = historyMonths[11].yearStr;

  // Active Debts Filter Engine based on auto-calculated Timeframes
  const activeDebtsThisMonth = debts?.filter((d: any) => {
    if (d.start_date && d.start_date.substring(0, 7) > currentMonthId) return false;
    if (d.end_date && d.end_date.substring(0, 7) < currentMonthId) return false;
    return true;
  }) || [];

  // --- LOAN CALCULATIONS ---
  const totalLoansOutstanding = activeDebtsThisMonth.reduce((s: number, d: any) => {
    const isPaidThisMonth = allDebtPayments.some((dp: any) => dp.debt_id == d.id && dp.paid_month === currentMonthId);
    return s + (isPaidThisMonth ? 0 : n(d.monthly_due) + n(d.arrears_balance) - n(d.float_balance));
  }, 0) ?? 0

  const paidLoansThisMonth = activeDebtsThisMonth.filter((d: any) => allDebtPayments.some((dp: any) => dp.debt_id == d.id && dp.paid_month === currentMonthId)).reduce((s: number, d: any) => s + n(d.monthly_due), 0) ?? 0;
  
  const paidLoansStatementTotal = activeDebtsThisMonth.reduce((s: number, d: any) => {
    const payment = allDebtPayments.find((dp: any) => dp.debt_id == d.id && dp.paid_month === currentMonthId);
    if (payment) {
      // Use the explicitly paid custom amount if present, else fallback to standard calculation
      return s + (payment.amount_paid ? Number(payment.amount_paid) : (n(d.monthly_due) + n(d.arrears_balance) - n(d.float_balance)));
    }
    return s;
  }, 0) ?? 0;

  // --- BSKL CALCULATIONS ---
  let totalBsklCapitalOutflowThisMonth = 0;
  let totalBsklRepaymentsInflowThisMonth = 0;
  let totalBsklRemainingCapitalToPay = 0; 
  let totalBsklCapitalAllTime = 0;
  let totalBsklRepaidAllTime = 0;

  const enrichedContracts = bsklContracts.map((c: any) => {
    const cCapital = n(c.capital_injection);
    const cPayments = bsklPayments.filter((p: any) => p.contract_id === c.id);
    const cTotalRepaid = cPayments.reduce((s: number, p: any) => s + n(p.amount), 0);
    const cNetBalance = cCapital - cTotalRepaid; 
    
    const isProfit = cNetBalance < 0;
    const displayAmount = Math.abs(cNetBalance);
    const displayPct = cCapital > 0 ? (displayAmount / cCapital) * 100 : 0;
    
    const recoveryPct = cCapital > 0 ? (cTotalRepaid / cCapital) * 100 : 0;
    const greenWidth = Math.min(100, recoveryPct);
    const blueWidth = Math.max(0, Math.min(100, recoveryPct - 100));

    if (c.effective_date.startsWith(currentMonthId)) {
      totalBsklCapitalOutflowThisMonth += cCapital;
    }
    const cPaidThisMonth = cPayments.filter((p: any) => p.paid_date.startsWith(currentMonthId)).reduce((s: number, p: any) => s + n(p.amount), 0);
    totalBsklRepaymentsInflowThisMonth += cPaidThisMonth;

    totalBsklCapitalAllTime += cCapital;
    totalBsklRepaidAllTime += cTotalRepaid;
    if (!isProfit && c.is_active) {
      totalBsklRemainingCapitalToPay += cNetBalance;
    }

    return { ...c, cTotalRepaid, isProfit, displayAmount, displayPct, cPaidThisMonth, recoveryPct, greenWidth, blueWidth };
  });

  // --- BUDGET & POOL CALCULATIONS ---
  const totalBudgetsAllocatedThisMonth = budgets?.reduce((s: number, b: any) => s + n(b.allocated_amount), 0) ?? 0;
  const totalBudgetsRemaining = budgets?.filter((b: any) => !b.is_saved).reduce((s: number, b: any) => s + Math.max(0, n(b.allocated_amount) - n(b.spent_amount)), 0) ?? 0
  const spentBudgetsThisMonth = budgets?.reduce((s: number, b: any) => s + n(b.spent_amount), 0) ?? 0
  const savedBudgetsThisMonth = budgets?.filter((b: any) => b.is_saved).reduce((s: number, b: any) => s + Math.max(0, n(b.allocated_amount) - n(b.spent_amount)), 0) ?? 0
  const totalSavedAcrossAllMonths = allBudgetsOfYear?.filter((b: any) => b.is_saved).reduce((s: number, b: any) => s + Math.max(0, n(b.allocated_amount) - n(b.spent_amount)), 0) ?? 0

  const totalTransferredFromPoolAllTime = transfers.reduce((s: number, t: any) => s + n(t.amount), 0);
  const poolTransfersInThisMonth = transfers.filter((t: any) => t.month_id === currentMonthId).reduce((s: number, t: any) => s + n(t.amount), 0);
  const totalCashInflowsAllTime = cashInflows.reduce((s: number, i: any) => s + n(i.amount), 0);
  const currentPoolBalance = totalSavedAcrossAllMonths + totalBsklRepaidAllTime + totalCashInflowsAllTime - totalTransferredFromPoolAllTime;

  // --- CASHFLOW & GRAND TOTALS ---
  const currentCheckingBalance = currentSalary + poolTransfersInThisMonth - totalBudgetsAllocatedThisMonth - paidLoansStatementTotal - totalBsklCapitalOutflowThisMonth;
  const totalRemainingBalance = totalLoansOutstanding + totalBudgetsRemaining + totalBsklRemainingCapitalToPay;
  const totalPaidThisMonth = paidLoansThisMonth + spentBudgetsThisMonth + savedBudgetsThisMonth + totalBsklRepaymentsInflowThisMonth;
  const grandTotalMonthlyFootprint = totalRemainingBalance + totalPaidThisMonth
  const progressPct = grandTotalMonthlyFootprint > 0 ? Math.min(100, (totalPaidThisMonth / grandTotalMonthlyFootprint) * 100) : 0
  
  const yearlyPaidLoans = allDebtPayments.filter((dp: any) => dp.paid_month.startsWith(year.toString())).reduce((sum: number, dp: any) => {
    const debt = debts?.find((d: any) => d.id == dp.debt_id); // using global debts reference to accurately sum historical regardless if it's currently active
    return sum + (debt ? n(debt.monthly_due) : 0);
  }, 0);

  const baseMonthlyLoanTotal = activeDebtsThisMonth.reduce((s: number, d: any) => s + n(d.monthly_due), 0) ?? 0
  const yearlyTotalAllocated = (allBudgetsOfYear?.reduce((s: number, b: any) => s + n(b.allocated_amount), 0) ?? 0) + baseMonthlyLoanTotal * 2 + totalBsklCapitalAllTime;
  const yearlyTotalBudgetCleared = allBudgetsOfYear?.reduce((s: number, b: any) => {
    const spent = n(b.spent_amount)
    const saved = b.is_saved ? Math.max(0, n(b.allocated_amount) - spent) : 0
    return s + spent + saved
  }, 0) ?? 0
  const yearlyTotalPaid = yearlyTotalBudgetCleared + yearlyPaidLoans + totalBsklRepaidAllTime;
  const yearlyProgressPercentage = yearlyTotalAllocated > 0 ? Math.min(100, (yearlyTotalPaid / yearlyTotalAllocated) * 100) : 0

  // --- MONTHLY SPLIT CHART MATH ---
  const monthlyLoansFlow = paidLoansStatementTotal;
  const monthlyBudgetsFlow = totalBudgetsAllocatedThisMonth;
  const monthlyBsklFlow = totalBsklCapitalOutflowThisMonth;
  const totalMonthlyFlow = monthlyLoansFlow + monthlyBudgetsFlow + monthlyBsklFlow;

  const pctLoans = totalMonthlyFlow > 0 ? (monthlyLoansFlow / totalMonthlyFlow) * 100 : 0;
  const pctBudgets = totalMonthlyFlow > 0 ? (monthlyBudgetsFlow / totalMonthlyFlow) * 100 : 0;
  const pctBskl = totalMonthlyFlow > 0 ? (monthlyBsklFlow / totalMonthlyFlow) * 100 : 0;

  // --- NET CASH REQUIRED MATH ---
  const reqTotal = totalBudgetsAllocatedThisMonth + baseMonthlyLoanTotal;
  const reqPctBudget = reqTotal > 0 ? (totalBudgetsAllocatedThisMonth / reqTotal) * 100 : 0;
  const reqPctLoan = reqTotal > 0 ? (baseMonthlyLoanTotal / reqTotal) * 100 : 0;

  const formattedMonthDisplay = new Date(currentSelectedMonth + 'T00:00:00').toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  }).toUpperCase()

  // --- CENTRALIZED TRANSACTION LOG ENGINE ---
  let systemLogs: any[] = [];
  
  budgetTransactions.forEach((t: any) => {
    const b = budgets.find((b: any) => b.id === t.budget_id) || allBudgetsOfYear.find((b: any) => b.id === t.budget_id);
    if (b && b.budget_month === currentSelectedMonth) {
       systemLogs.push({
         id: t.id,
         date: t.created_at,
         description: `Budget: ${b.category} (${t.transaction_type})`,
         amount: Number(t.amount),
         type: t.transaction_type === 'reduce' ? 'in' : 'out', 
         source: 'budget',
         raw: t
       });
    }
  });

  transfers.filter((t: any) => t.month_id === currentMonthId).forEach((t: any) => {
    systemLogs.push({
      id: t.id,
      date: t.created_at || `${currentMonthId}-01T00:00:00Z`,
      description: `Liquidity Transfer IN`,
      amount: Number(t.amount),
      type: 'in',
      source: 'transfer',
      raw: t
    });
  });

  cashInflows.filter((i: any) => i.month_id === currentMonthId).forEach((i: any) => {
    systemLogs.push({
      id: i.id,
      date: i.created_at || `${currentMonthId}-01T00:00:00Z`,
      description: `Inflow: ${i.particular}`,
      amount: Number(i.amount),
      type: 'in',
      source: 'inflow',
      raw: i
    });
  });

  allDebtPayments.filter((dp: any) => dp.paid_month === currentMonthId).forEach((dp: any) => {
    const d = debts.find((d: any) => d.id == dp.debt_id);
    if (d) {
      systemLogs.push({
        id: dp.id || `${dp.debt_id}-${dp.paid_month}`,
        date: dp.created_at || `${currentMonthId}-01T00:00:00Z`,
        description: `Debt Paid: ${d.creditor}`,
        amount: dp.amount_paid ? Number(dp.amount_paid) : (n(d.monthly_due) + n(d.arrears_balance) - n(d.float_balance)),
        type: 'out',
        source: 'debt',
        raw: { debt_id: dp.debt_id, paid_month: dp.paid_month }
      });
    }
  });

  bsklPayments.filter((p: any) => p.paid_date.startsWith(currentMonthId)).forEach((p: any) => {
    const c = bsklContracts.find((c: any) => c.id == p.contract_id);
    if (c) {
      systemLogs.push({
        id: p.id || `${p.contract_id}-${p.paid_date}`,
        date: p.paid_date + "T00:00:00Z",
        description: `Trade Return: ${c.name}`,
        amount: Number(p.amount),
        type: 'in',
        source: 'bskl',
        raw: { contract_id: p.contract_id, paid_date: p.paid_date }
      });
    }
  });

  systemLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const logTotalIn = systemLogs.filter(l => l.type === 'in').reduce((s, l) => s + l.amount, 0);
  const logTotalOut = systemLogs.filter(l => l.type === 'out').reduce((s, l) => s + l.amount, 0);
  const logNetBalance = logTotalIn - logTotalOut;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        body { 
          background-color: #0b0e14 !important; 
          color: #e2e8f0 !important; 
          color-scheme: dark !important; 
        }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #0b0e14; }
        ::-webkit-scrollbar-thumb { background: #272b38; border-radius: 9999px; }
      `}} />

      <main className="min-h-screen bg-[#0b0e14] text-slate-200 antialiased font-sans w-full max-w-[1600px] mx-auto pb-16 relative">
        
        {/* MODAL POPUP FOR MULTI-CONTRACT BSKL PAYMENTS */}
        {bsklModalDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-[#272b38] flex justify-between items-center bg-[#0b0e14]">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-widest">Trade Returns</h3>
                  <p className="text-xs text-teal-400 font-bold tracking-widest mt-1">{new Date(bsklModalDate).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                <a href={`?month=${currentSelectedMonth}${isEditing ? '&edit=true' : ''}`} className="text-[#8a93a6] hover:text-white text-2xl leading-none">&times;</a>
              </div>
              <div className="p-6 space-y-4">
                {enrichedContracts.filter((c: any) => {
                  const cEffDate = c.effective_date;
                  const cEndDate = c.end_date || '2099-12-31';
                  return bsklModalDate >= cEffDate && bsklModalDate <= cEndDate;
                }).map((c: any) => {
                  const isPaid = bsklPayments.some((p: any) => p.contract_id === c.id && p.paid_date === bsklModalDate);
                  
                  if (isReadOnly) {
                    return (
                      <div key={c.id} className={`flex justify-between items-center p-4 rounded-xl border ${isPaid ? 'bg-teal-500/10 border-teal-500/30' : 'bg-[#0b0e14] border-[#383e52]'}`}>
                        <div>
                          <p className={`font-bold ${isPaid ? 'text-teal-400' : 'text-white'}`}>{c.name}</p>
                          <p className="text-[10px] text-[#8a93a6] uppercase tracking-widest mt-1">RM {n(c.daily_rate).toFixed(2)}</p>
                        </div>
                        <span className="text-[9px] font-bold text-[#8a93a6] uppercase bg-[#161a23] px-3 py-1.5 border border-[#272b38] rounded-md tracking-widest">
                          {isPaid ? 'Collected' : 'Pending'}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <form key={c.id} action={toggleBsklPayment} className={`flex justify-between items-center p-4 rounded-xl border ${isPaid ? 'bg-teal-500/10 border-teal-500/30' : 'bg-[#0b0e14] border-[#383e52]'}`}>
                      <input type="hidden" name="contract_id" value={c.id} />
                      <input type="hidden" name="date" value={bsklModalDate} />
                      <input type="hidden" name="amount" value={c.daily_rate} />
                      <input type="hidden" name="isPaid" value={String(isPaid)} />
                      <div>
                        <p className={`font-bold ${isPaid ? 'text-teal-400' : 'text-white'}`}>{c.name}</p>
                        <p className="text-[10px] text-[#8a93a6] uppercase tracking-widest mt-1">RM {n(c.daily_rate).toFixed(2)}</p>
                      </div>
                      <button type="submit" className={`text-[10px] uppercase tracking-widest font-black px-4 py-2 rounded-lg transition-colors border ${isPaid ? 'bg-[#161a23] text-[#8a93a6] border-[#383e52] hover:bg-[#272b38]' : 'bg-teal-500/20 text-teal-400 border-teal-500/50 hover:bg-teal-500/30 shadow-[0_0_10px_rgba(20,184,166,0.15)]'}`}>
                        {isPaid ? 'Undo' : 'Collect'}
                      </button>
                    </form>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* MODAL POPUP FOR LEDGER TRANSACTION LOGS */}
        {isLogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-5 sm:p-6 border-b border-[#272b38] flex justify-between items-center bg-[#0b0e14] shrink-0">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-widest">Transaction Log</h3>
                  <p className="text-xs text-teal-400 font-bold tracking-widest mt-1">Cycle: {formattedMonthDisplay}</p>
                </div>
                <a href={`?month=${currentSelectedMonth}${isEditing ? '&edit=true' : ''}`} className="text-[#8a93a6] hover:text-white text-2xl leading-none">&times;</a>
              </div>
              
              <div className="bg-[#161a23] border-b border-[#272b38] p-4 sm:p-5 flex justify-between items-center shrink-0">
                 <div className="flex gap-4">
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-[#8a93a6] font-bold">Total In</p>
                      <p className="text-teal-400 font-mono font-bold mt-1">+{logTotalIn.toFixed(2)}</p>
                    </div>
                    <div className="border-l border-[#272b38] pl-4">
                      <p className="text-[9px] uppercase tracking-widest text-[#8a93a6] font-bold">Total Out</p>
                      <p className="text-rose-400 font-mono font-bold mt-1">-{logTotalOut.toFixed(2)}</p>
                    </div>
                 </div>
                 <div className="text-right border-l border-[#272b38] pl-4">
                    <p className="text-[9px] uppercase tracking-widest text-[#8a93a6] font-bold">Net Balance Flow</p>
                    <p className={`font-black text-xl mt-1 tracking-tight ${logNetBalance >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                      {logNetBalance >= 0 ? '+' : ''}{logNetBalance.toFixed(2)}
                    </p>
                 </div>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                {systemLogs.length === 0 && <p className="text-[#8a93a6] text-sm text-center py-10">No transactions recorded for this cycle yet.</p>}
                {systemLogs.map(log => {
                   const isEditingLog = editLogId === log.id;
                   return (
                     <div key={log.id} className="p-4 bg-[#0b0e14] border border-[#272b38] rounded-xl flex flex-col gap-3 shadow-sm hover:border-[#383e52] transition-colors">
                       <div className="flex justify-between items-center gap-3">
                         <div>
                           <p className="font-bold text-white text-sm leading-tight">{log.description}</p>
                           <p className="text-[9px] text-[#8a93a6] tracking-widest font-mono mt-1.5 uppercase">{new Date(log.date).toLocaleDateString('en-MY')} • {log.source}</p>
                         </div>
                         <div className="text-right">
                           <p className={`font-bold text-lg tracking-tight ${log.type === 'in' ? 'text-teal-400' : 'text-rose-400'}`}>
                             {log.type === 'in' ? '+' : '-'}RM {log.amount.toFixed(2)}
                           </p>
                         </div>
                       </div>
                       {!isReadOnly && (
                         <div className="flex justify-end gap-2 border-t border-[#272b38] pt-3 mt-1">
                           {(log.source === 'budget' || log.source === 'transfer' || log.source === 'inflow') && !isEditingLog && (
                             <a href={`?month=${currentSelectedMonth}&log=true&editLog=${log.id}${isEditing ? '&edit=true' : ''}`} className="text-[9px] uppercase tracking-widest font-bold px-4 py-2 bg-[#161a23] text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors">Amend</a>
                           )}
                           {!isEditingLog && (
                             <form action={deleteLogEntry}>
                               <input type="hidden" name="id" value={log.id} />
                               <input type="hidden" name="source" value={log.source} />
                               {log.source === 'debt' && <><input type="hidden" name="raw_debt_id" value={log.raw.debt_id} /><input type="hidden" name="raw_paid_month" value={log.raw.paid_month} /></>}
                               {log.source === 'bskl' && <><input type="hidden" name="raw_contract_id" value={log.raw.contract_id} /><input type="hidden" name="raw_paid_date" value={log.raw.paid_date} /></>}
                               <button type="submit" className="text-[9px] uppercase tracking-widest font-bold px-4 py-2 bg-rose-600/10 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-600/20 transition-colors">Delete</button>
                             </form>
                           )}
                         </div>
                       )}

                       {isEditingLog && (log.source === 'budget' || log.source === 'transfer' || log.source === 'inflow') && (
                         <form action={amendLogEntry} className="flex gap-2 border-t border-[#272b38] pt-3 mt-1">
                           <input type="hidden" name="id" value={log.id} />
                           <input type="hidden" name="source" value={log.source} />
                           <input type="number" step="0.01" name="amount" defaultValue={log.amount.toFixed(2)} className="flex-1 bg-[#161a23] border border-[#383e52] rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-amber-500/50" />
                           <button type="submit" className="text-[9px] uppercase tracking-widest font-bold px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors">Save</button>
                           <a href={`?month=${currentSelectedMonth}&log=true${isEditing ? '&edit=true' : ''}`} className="text-[9px] uppercase tracking-widest font-bold px-4 py-2 bg-[#161a23] text-[#8a93a6] border-[#383e52] rounded-lg hover:text-white flex items-center transition-colors">Cancel</a>
                         </form>
                       )}
                     </div>
                   )
                })}
              </div>
            </div>
          </div>
        )}

        {/* FINANCE PULSE HEADER */}
        <header className="p-4 sm:p-6 md:px-10 pt-6 pb-6 flex justify-between items-center bg-[#0b0e14] border-b border-[#272b38] sticky top-0 z-20">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-teal-500/50 flex items-center justify-center bg-teal-500/10 shadow-[0_0_15px_rgba(20,184,166,0.15)]">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h4l3-9 5 18 3-9h6" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-widest uppercase">
                FINANCE <span className="text-amber-400">PULSE</span>
              </h1>
            </div>
          </div>
          
          {isReadOnly ? (
            <div className="text-[9px] md:text-xs font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-full border bg-[#161a23] text-[#8a93a6] border-[#272b38] uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8a93a6]"></span> VIEWER MODE
            </div>
          ) : (
            <a
              href={`?month=${currentSelectedMonth}${isEditing ? '' : '&edit=true'}`}
              className={`text-[9px] sm:text-[10px] md:text-xs font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-full border transition-all uppercase tracking-widest flex items-center gap-1.5 sm:gap-2 ${
                isEditing 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/50 hover:bg-rose-500/20' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(251,191,36,0.05)]'
              }`}
            >
              {isEditing ? (
                <><span className="text-base leading-none">&times;</span> CLOSE SYNC</>
              ) : (
                <><span className="text-base leading-none">&#9881;</span> CUSTOMIZE</>
              )}
            </a>
          )}
        </header>

        <div className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8">
          
          {/* --- DYNAMIC TIME SWITCHER --- */}
          <div className="flex justify-between sm:justify-center items-center gap-3 sm:gap-6 max-w-2xl mx-auto mb-4 sm:mb-10 bg-[#161a23]/30 sm:bg-transparent p-2 rounded-xl border border-[#272b38]/30 sm:border-transparent">
            <a href={`?month=${prevMonthStr}`} className="text-[8px] sm:text-[10px] md:text-xs font-bold px-3 py-1.5 sm:px-5 sm:py-2 rounded-full border border-[#272b38] sm:border-transparent text-[#8a93a6] hover:text-white hover:bg-[#161a23] transition-all tracking-widest uppercase">
              &laquo; {prevMonthLabel}
            </a>
            <span className="text-xs sm:text-lg md:text-2xl font-black text-white uppercase tracking-widest text-center">{formattedMonthDisplay}</span>
            <a href={`?month=${nextMonthStr}`} className="text-[8px] sm:text-[10px] md:text-xs font-bold px-3 py-1.5 sm:px-5 sm:py-2 rounded-full border border-[#272b38] sm:border-transparent text-[#8a93a6] hover:text-white hover:bg-[#161a23] transition-all tracking-widest uppercase">
              {nextMonthLabel} &raquo;
            </a>
          </div>

          {/* --- 4-COLUMN RESPONSIVE METRICS GRID --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            
            {/* 1. CHECKING ACCOUNT */}
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col justify-between relative overflow-hidden group hover:border-[#383e52] transition-colors">
              <div className="relative z-10 w-full">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] sm:text-[11px] text-[#8a93a6] font-semibold uppercase tracking-[0.15em]">Checking Account</p>
                  <span className="border border-amber-500/30 text-amber-400 bg-amber-500/10 px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-widest">SALARY</span>
                </div>
                <p className={`text-2xl sm:text-3xl md:text-4xl font-bold mt-2 tracking-tight ${currentCheckingBalance < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                  RM {currentCheckingBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </p>
                {!isReadOnly && (
                  <form action={updateSalary} className="flex gap-2 mt-4 sm:mt-5">
                    <input type="hidden" name="monthId" value={currentMonthId} />
                    <input type="number" step="0.01" name="amount" defaultValue={currentSalary || ''} placeholder="Set Salary..." className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white placeholder-[#8a93a6] text-xs outline-none focus:border-amber-500/50" />
                    <button type="submit" className="bg-[#272b38] text-white px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[#383e52] transition-colors">SET</button>
                  </form>
                )}
                <div className="space-y-1.5 font-medium text-[#8a93a6] mt-4 text-[9px] border-t border-[#272b38]/50 pt-3">
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Salary IN</span> <span className="text-teal-400 font-mono">+{currentSalary.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center border-b border-[#272b38] pb-1.5"><span className="uppercase tracking-widest">Pool Transf. IN</span> <span className="text-teal-400 font-mono">+{poolTransfersInThisMonth.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center pt-1"><span className="uppercase tracking-widest">Budgets OUT</span> <span className="text-rose-400 font-mono">-{totalBudgetsAllocatedThisMonth.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Loans OUT</span> <span className="text-rose-400 font-mono">-{paidLoansStatementTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Capital Inj. OUT</span> <span className="text-rose-400 font-mono">-{totalBsklCapitalOutflowThisMonth.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

            {/* 2. NET CASH REQUIRED */}
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col justify-between group hover:border-[#383e52] transition-colors">
              <div>
                <p className="text-[10px] sm:text-[11px] text-[#8a93a6] font-semibold uppercase tracking-[0.15em] mb-2">Net Cash Required</p>
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                    RM {totalRemainingBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                  </p>
                  <a href={`?month=${currentSelectedMonth}&log=true${isEditing ? '&edit=true' : ''}`} className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 text-teal-400 bg-teal-500/10 border border-teal-500/30 rounded-lg hover:bg-teal-500/20 transition-colors shadow-[0_0_10px_rgba(20,184,166,0.1)]" title="Transaction Log">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </a>
                </div>
                
                <div className="flex justify-between items-center border-t border-[#272b38]/50 pt-3 mt-3">
                  <div className="space-y-1.5 text-[#8a93a6] text-[9px] sm:text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className="uppercase tracking-widest font-bold w-14">Budget:</span> 
                      <span className="font-mono text-white">RM {totalBudgetsAllocatedThisMonth.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                      <span className="text-teal-400 font-bold ml-1">{reqPctBudget.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="uppercase tracking-widest font-bold w-14">Loan:</span> 
                      <span className="font-mono text-white">RM {baseMonthlyLoanTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                      <span className="text-amber-400 font-bold ml-1">{reqPctLoan.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full shadow-[0_0_15px_rgba(45,212,191,0.25)] flex-shrink-0 ml-2" style={{
                    background: reqTotal > 0 ? `conic-gradient(#2dd4bf 0% ${reqPctBudget}%, #fbbf24 ${reqPctBudget}% 100%)` : 'transparent',
                    border: reqTotal === 0 ? '1px solid #272b38' : 'none'
                  }}></div>
                </div>
              </div>
              <div className="mt-6 sm:mt-8">
                <div className="w-full h-2 bg-[#272b38] rounded-full">
                  <div className="bg-teal-400 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(45,212,191,0.5)]" style={{ width: `${progressPct}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-4 mt-4 pt-4 border-t border-[#272b38]/50 text-xs">
                  <div>
                    <p className="uppercase font-bold text-[#8a93a6] tracking-widest text-[8px] sm:text-[9px]">Total Footprint</p>
                    <p className="font-mono text-white mt-1 text-xs sm:text-sm">{grandTotalMonthlyFootprint.toFixed(2)}</p>
                  </div>
                  <div className="border-l border-[#272b38]/50 pl-2 sm:pl-4">
                    <p className="uppercase font-bold text-[#8a93a6] tracking-widest text-[8px] sm:text-[9px]">Settled / Pooled</p>
                    <p className="font-mono text-teal-400 mt-1 text-xs sm:text-sm">{totalPaidThisMonth.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. MONTHLY SPLIT & YEAR-TO-DATE TRACKING */}
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col justify-between group hover:border-[#383e52] transition-colors gap-6">
              
              {/* Monthly Split Pie Chart */}
              <div className="flex justify-between items-center">
                <div className="space-y-2">
                  <p className="text-[10px] sm:text-[11px] text-[#8a93a6] font-semibold uppercase tracking-[0.15em] mb-2">Monthly Flow</p>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400"></span><span className="text-[8px] sm:text-[9px] text-white uppercase tracking-widest">Loans <span className="text-[#8a93a6] ml-1">{pctLoans.toFixed(0)}%</span></span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-teal-400"></span><span className="text-[8px] sm:text-[9px] text-white uppercase tracking-widest">Budgets <span className="text-[#8a93a6] ml-1">{pctBudgets.toFixed(0)}%</span></span></div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400"></span><span className="text-[8px] sm:text-[9px] text-white uppercase tracking-widest">Trades <span className="text-[#8a93a6] ml-1">{pctBskl.toFixed(0)}%</span></span></div>
                </div>
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 mr-2 rounded-full shadow-[0_0_20px_rgba(45,212,191,0.25)]" style={{
                  background: totalMonthlyFlow > 0 ? `conic-gradient(#fbbf24 0% ${pctLoans}%, #2dd4bf ${pctLoans}% ${pctLoans + pctBudgets}%, #60a5fa ${pctLoans + pctBudgets}% 100%)` : 'transparent',
                  border: totalMonthlyFlow === 0 ? '1px solid #272b38' : 'none'
                }}>
                </div>
              </div>

              {/* YTD Data (Pushed closer to footnote) */}
              <div className="border-t border-[#272b38]/50 pt-4 mt-auto">
                <div className="flex justify-between items-end mb-3">
                  <div className="space-y-1">
                    <p className="text-[9px] sm:text-[10px] text-[#8a93a6] font-semibold uppercase tracking-[0.15em]">Year-To-Date</p>
                    <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      RM {yearlyTotalPaid.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-[#8a93a6] tracking-wider uppercase">
                      TARGET <span className="text-white font-mono">{yearlyTotalAllocated.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_6px_rgba(45,212,191,0.2)]" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#272b38" strokeWidth="4"></circle>
                      <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="currentColor" strokeWidth="4" 
                        strokeDasharray={`${yearlyProgressPercentage}, 100`} strokeLinecap="round" 
                        className="text-teal-400 transition-all duration-1000 ease-out">
                      </circle>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-[8px] sm:text-[10px] font-bold text-white leading-none tracking-tight">{yearlyProgressPercentage.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[8px] text-[#8a93a6] tracking-wider leading-relaxed">Total structural volume cleared & pooled across all logged cycles.</p>
              </div>
            </div>

            {/* 4. LIQUIDITY POOL ACCOUNT */}
            <div className="bg-[#161a23] border border-[#272b38] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col justify-between group hover:border-[#383e52] transition-colors relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-400/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] sm:text-[11px] text-[#8a93a6] font-semibold uppercase tracking-[0.15em]">Liquidity Pool</p>
                  <span className="border border-teal-500/30 text-teal-400 bg-teal-500/10 px-2.5 py-0.5 sm:py-1 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-teal-400 animate-pulse"></span> LOCKED
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-teal-400 tracking-tight mt-1 drop-shadow-[0_0_10px_rgba(45,212,191,0.2)]">
                  RM {currentPoolBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="relative z-10 mt-4 sm:mt-5">
                {!isReadOnly && (
                  <form action={transferFromPool} className="flex gap-2">
                    <input type="hidden" name="monthId" value={currentMonthId} />
                    <input type="number" step="0.01" name="amount" placeholder="Withdraw..." max={currentPoolBalance > 0 ? currentPoolBalance : 0} className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white placeholder-[#8a93a6] text-xs outline-none focus:border-teal-500/50" />
                    <button type="submit" disabled={currentPoolBalance <= 0} className="bg-[#272b38] text-white px-2.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[#383e52] transition-colors disabled:opacity-50">MOVE</button>
                  </form>
                )}
                <div className="space-y-1.5 font-medium text-[#8a93a6] mt-4 text-[9px] border-t border-[#272b38]/50 pt-3">
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Total Pooled IN</span> <span className="text-teal-400 font-mono">+{totalSavedAcrossAllMonths.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Trade Returns IN</span> <span className="text-teal-400 font-mono">+{totalBsklRepaidAllTime.toFixed(2)}</span></div>
                  {totalCashInflowsAllTime > 0 && (
                    <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Cash Inflows IN</span> <span className="text-teal-400 font-mono">+{totalCashInflowsAllTime.toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between items-center"><span className="uppercase tracking-widest">Total Transf. OUT</span> <span className="text-rose-400 font-mono">-{totalTransferredFromPoolAllTime.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

          </div>

          {/* --- ADJUSTMENTS PANEL (HIDDEN BY DEFAULT) --- */}
          {isEditing && (
            <div className="space-y-6 mt-6">
              
              {/* STATEMENT SYNC UTILITY */}
              <div className="bg-[#161a23] border border-amber-500/30 rounded-2xl p-4 sm:p-6 md:p-8 space-y-6">
                <h3 className="text-xs font-bold uppercase text-amber-400 tracking-[0.15em]">Statement Sync Utility</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                  {debts?.map((debt: any) => {
                    const calcTenure = n(debt.monthly_due) > 0 ? Math.ceil(n(debt.original_loan_amount) / n(debt.monthly_due)) : 0;
                    const defaultTenure = debt.financing_tenure || calcTenure || '';
                    let calcEndDate = '';
                    if (debt.start_date && defaultTenure) {
                       const d = new Date(debt.start_date);
                       d.setMonth(d.getMonth() + Number(defaultTenure));
                       calcEndDate = d.toISOString().split('T')[0];
                    }
                    const defaultEndDate = debt.end_date || calcEndDate || '';
                    const defaultStartDate = debt.start_date || '';

                    return (
                      <form key={debt.id} action={updateDebtBalances} className="p-4 sm:p-5 bg-[#0b0e14] rounded-xl border border-[#272b38] space-y-4 shadow-sm hover:border-[#383e52] transition-colors flex flex-col justify-between">
                        <div>
                          <input type="hidden" name="id" value={debt.id} />
                          <div className="flex items-center gap-2 mb-4">
                            <input type="text" name="creditor" defaultValue={debt.creditor} className="w-full bg-transparent font-bold text-white text-sm outline-none border-b border-transparent focus:border-amber-500/50 pb-1 transition-colors" placeholder="Liability Name" />
                            <button formAction={removeDebt} type="submit" className="text-[#8a93a6] hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded transition-colors" title="Delete Liability">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="col-span-2">
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Outstanding Principal (RM)</label>
                              <input name="total_debt_amount" type="number" step="0.01" defaultValue={n(debt.total_debt_amount).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Monthly Due (RM)</label>
                              <input name="monthly_due" type="number" step="0.01" defaultValue={n(debt.monthly_due).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Facility Limit (RM)</label>
                              <input name="original_loan_amount" type="number" step="0.01" defaultValue={n(debt.original_loan_amount).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Start Date</label>
                              <input name="start_date" type="date" defaultValue={defaultStartDate} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Tenure (Months)</label>
                              <input name="financing_tenure" type="number" defaultValue={defaultTenure} placeholder="Auto" className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">End Date</label>
                              <input name="end_date" type="date" defaultValue={defaultEndDate} placeholder="Auto-calculated if blank" className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Arrears (RM)</label>
                              <input name="arrears" type="number" step="0.01" defaultValue={n(debt.arrears_balance).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                            <div>
                              <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Float (RM)</label>
                              <input name="float" type="number" step="0.01" defaultValue={n(debt.float_balance).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                            </div>
                          </div>
                        </div>
                        <button type="submit" className="w-full bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-4">Save Changes</button>
                      </form>
                    )
                  })}

                  <form action={addDebt} className="p-4 sm:p-5 bg-[#161a23] rounded-xl border border-dashed border-[#383e52] space-y-4 shadow-sm hover:border-amber-500/50 transition-colors flex flex-col justify-between">
                    <div>
                      <p className="font-bold text-amber-400 text-sm border-b border-amber-500/20 pb-1 mb-4">+ Add New Liability</p>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                           <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Creditor Name</label>
                           <input name="creditor" type="text" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" placeholder="e.g. Home Loan" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Monthly Due</label>
                            <input name="monthly_due" type="number" step="0.01" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                          </div>
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Facility Limit</label>
                            <input name="original_loan_amount" type="number" step="0.01" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                          </div>
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Start Date</label>
                            <input name="start_date" type="date" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                          </div>
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Tenure (Mth)</label>
                            <input name="financing_tenure" type="number" placeholder="Auto" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">End Date</label>
                            <input name="end_date" type="date" placeholder="Auto" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-amber-500/50 transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-4">+ Add Liability</button>
                  </form>
                </div>
              </div>

              {/* BSKL UNIFIED MANAGEMENT UTILITY */}
              <div className="bg-[#161a23] border border-[#272b38] rounded-2xl p-4 sm:p-6 md:p-8 space-y-8">
                
                {/* 1. CONTRACTS */}
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-xs font-bold uppercase text-blue-400 tracking-[0.15em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> BSKL Trade Utility
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                    {bsklContracts.map((c: any) => (
                      <form key={c.id} className="p-4 sm:p-5 bg-[#0b0e14] rounded-xl border border-[#272b38] space-y-4 shadow-sm hover:border-[#383e52] transition-colors flex flex-col justify-between">
                        <input type="hidden" name="id" value={c.id} />
                        <div>
                          <div className="flex justify-between items-center border-b border-[#272b38] pb-2 mb-3 gap-2">
                            {c.is_active ? (
                              <input name="name" defaultValue={c.name} required className="w-full bg-transparent font-bold text-white text-sm outline-none border-b border-transparent focus:border-blue-500/50 pb-0.5 transition-colors" />
                            ) : (
                              <p className="font-bold text-white text-sm">{c.name}</p>
                            )}
                            {c.is_active ? (
                              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-widest border border-emerald-500/30 flex-shrink-0">Active</span>
                            ) : (
                              <span className="text-[8px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded uppercase tracking-widest border border-rose-500/30 flex-shrink-0">Ended</span>
                            )}
                          </div>
                          
                          {c.is_active ? (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Capital</label>
                                <input name="capital" type="number" step="0.01" required defaultValue={n(c.capital_injection).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded px-2 py-1 text-white text-xs mt-1 outline-none focus:border-blue-500/50" />
                              </div>
                              <div>
                                <label className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Eff. Date</label>
                                <input name="effectiveDate" type="date" required defaultValue={c.effective_date} className="w-full bg-[#161a23] border border-[#272b38] rounded px-2 py-1 text-white text-xs mt-1 outline-none focus:border-blue-500/50" />
                              </div>
                              <div>
                                <label className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Rate / Day</label>
                                <input name="rate" type="number" step="0.01" required defaultValue={n(c.daily_rate).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded px-2 py-1 text-teal-400 font-mono text-xs mt-1 outline-none focus:border-blue-500/50" />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Capital</p>
                                <p className="text-xs text-white mt-1 font-mono">{n(c.capital_injection).toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Eff. Date</p>
                                <p className="text-xs text-white mt-1 font-mono">{c.effective_date}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-[#8a93a6] uppercase tracking-widest font-bold">Rate / Day</p>
                                <p className="text-xs text-teal-400 mt-1 font-mono">{n(c.daily_rate).toFixed(2)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {c.is_active && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-[#272b38]">
                            <button formAction={updateBsklContract} className="flex-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 font-bold py-2 rounded-lg transition-colors text-[10px] uppercase tracking-widest">Edit / Save</button>
                            <button formAction={endBsklContract} className="flex-1 bg-[#161a23] text-rose-400 border border-[#383e52] hover:bg-rose-500/10 hover:border-rose-500/40 font-bold py-2 rounded-lg transition-colors text-[10px] uppercase tracking-widest">End</button>
                          </div>
                        )}
                      </form>
                    ))}

                    <form action={addBsklContract} className="p-4 sm:p-5 bg-[#161a23] rounded-xl border border-dashed border-[#383e52] space-y-4 shadow-sm hover:border-blue-500/50 transition-colors flex flex-col justify-center">
                      <p className="font-bold text-blue-400 text-sm border-b border-blue-500/20 pb-1">+ New Injection</p>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                           <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Contract Name</label>
                           <input name="name" type="text" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-colors" placeholder="e.g. Batch 2" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div className="col-span-2">
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Capital (RM)</label>
                            <input name="capital" type="number" step="0.01" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-colors" />
                          </div>
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Rate / Day</label>
                            <input name="rate" type="number" step="0.01" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-colors" />
                          </div>
                          <div>
                            <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Eff. Date</label>
                            <input name="effectiveDate" type="date" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-blue-500/50 transition-colors" />
                          </div>
                        </div>
                      </div>
                      <button type="submit" className="w-full bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-2">+ Add Contract</button>
                    </form>
                  </div>
                </div>

                <div className="w-full h-px bg-[#272b38]"></div>

                {/* 2. HOLIDAYS */}
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="text-xs font-bold uppercase text-emerald-400 tracking-[0.15em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> BSKL Holidays Utility
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                    {bsklHolidays.map((h: any) => (
                      <div key={h.id} className="p-4 bg-[#0b0e14] rounded-xl border border-[#272b38] flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-bold text-white text-sm">{h.description || 'Holiday'}</p>
                          <p className="text-[10px] text-[#8a93a6] font-mono mt-1">{h.holiday_date}</p>
                        </div>
                        <form action={removeBsklHoliday}>
                          <input type="hidden" name="id" value={h.id} />
                          <button type="submit" className="text-rose-400 hover:text-rose-300 text-lg leading-none p-1">&times;</button>
                        </form>
                      </div>
                    ))}

                    <form action={addBsklHoliday} className="p-4 bg-[#161a23] rounded-xl border border-dashed border-[#383e52] shadow-sm hover:border-emerald-500/50 transition-colors flex flex-col justify-center">
                      <p className="font-bold text-emerald-400 text-sm border-b border-emerald-500/20 pb-1 mb-3">+ Add Holiday</p>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] text-[#8a93a6] block mb-1 uppercase tracking-widest font-bold">Date</label>
                          <input name="date" type="date" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-emerald-500/50 transition-colors" />
                        </div>
                        <div>
                          <label className="text-[9px] text-[#8a93a6] block mb-1 uppercase tracking-widest font-bold">Description</label>
                          <input name="description" type="text" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-emerald-500/50 transition-colors" placeholder="e.g. Hari Raya" />
                        </div>
                      </div>
                      <button type="submit" className="w-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-3">+ Add</button>
                    </form>
                  </div>
                </div>

              </div>

              {/* BUDGET SYNC UTILITY */}
              <div className="bg-[#161a23] border border-teal-500/30 rounded-2xl p-4 sm:p-6 md:p-8 space-y-6">
                <h3 className="text-xs font-bold uppercase text-teal-400 tracking-[0.15em]">Budget Sync Utility</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                  {budgets?.map((budget: any) => (
                    <form key={budget.id} action={updateBudgetSettings} className="p-4 sm:p-5 bg-[#0b0e14] rounded-xl border border-[#272b38] space-y-4 shadow-sm hover:border-[#383e52] transition-colors">
                      <input type="hidden" name="id" value={budget.id} />
                      <div className="flex items-center gap-2">
                        <input type="text" name="category" defaultValue={budget.category} className="w-full bg-transparent font-bold text-white text-sm outline-none border-b border-transparent focus:border-teal-500/50 pb-1 transition-colors" placeholder="Budget Category Name" />
                        <button formAction={removeBudget} type="submit" className="text-[#8a93a6] hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded transition-colors" title="Delete Budget">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div>
                        <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Allocated (RM)</label>
                        <input name="allocated" type="number" step="0.01" defaultValue={n(budget.allocated_amount).toFixed(2)} className="w-full bg-[#161a23] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-teal-500/50 transition-colors" />
                      </div>
                      <button type="submit" className="w-full bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-2">Save Changes</button>
                    </form>
                  ))}

                  <form action={addBudget} className="p-4 sm:p-5 bg-[#161a23] rounded-xl border border-dashed border-[#383e52] space-y-4 shadow-sm hover:border-teal-500/50 transition-colors flex flex-col justify-center">
                    <input type="hidden" name="budget_month" value={currentSelectedMonth} />
                    <p className="font-bold text-teal-400 text-sm border-b border-teal-500/20 pb-1 mb-2">+ Add New Budget</p>
                    <div className="space-y-3 sm:space-y-4">
                      <div>
                         <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Category</label>
                         <input name="category" type="text" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-teal-500/50 transition-colors" placeholder="e.g. Utilities" />
                      </div>
                      <div>
                        <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Allocated (RM)</label>
                        <input name="allocated_amount" type="number" step="0.01" required className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-xs outline-none focus:border-teal-500/50 transition-colors" />
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 font-bold py-2.5 rounded-lg transition-colors text-[10px] uppercase tracking-widest mt-2">+ Add Budget</button>
                  </form>
                </div>
              </div>

            </div>
          )}

          {/* --- MAIN RESPONSIVE DESKTOP/MOBILE GRID --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            
            {/* LEFT COLUMN: LIABILITIES & BSKL */}
            <section className="space-y-4">
              <div className="flex justify-between items-center pl-1">
                <h2 className="text-[11px] font-semibold uppercase text-[#8a93a6] tracking-[0.15em]">Priority Liabilities</h2>
                <span className="border border-amber-500/30 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest">DUE 20TH</span>
              </div>
              
              <div className="space-y-4">
                {activeDebtsThisMonth.map((debt: any) => {
                  const paymentRecord = allDebtPayments.find((dp: any) => dp.debt_id == debt.id && dp.paid_month === currentMonthId);
                  const debtIsPaidThisMonth = !!paymentRecord;
                  const statementTotalDue = n(debt.monthly_due) + n(debt.arrears_balance) - n(debt.float_balance)
                  const actualAmountPaid = paymentRecord?.amount_paid ? Number(paymentRecord.amount_paid) : statementTotalDue;
                  const isExpanded = expandedDebtId == String(debt.id)
                  
                  // DYNAMIC ARREARS & PRINCIPAL AGEING LOGIC
                  let currentArrears = n(debt.arrears_balance);
                  let currentPrincipal = n(debt.total_debt_amount);
                  
                  if (debtIsPaidThisMonth) {
                    // Formula dinamik: Tunggakan sedia ada + (Ansuran Bulanan - Amaun yang dibayar)
                    currentArrears = Math.max(0, currentArrears + n(debt.monthly_due) - actualAmountPaid);
                    // Tolak principal secara visual (anggaran awal sebelum disegerak dengan bank)
                    currentPrincipal = Math.max(0, currentPrincipal - actualAmountPaid);
                  }
                  
                  const arrearsCount = n(debt.monthly_due) > 0 ? Math.floor(currentArrears / n(debt.monthly_due)) : 0;

                  let statusText = 'Outstanding';
                  let statusColor = 'text-amber-400';
                  if (debtIsPaidThisMonth) {
                      if (actualAmountPaid < n(debt.monthly_due)) {
                          statusText = 'Partial Payment (Arrears Increased)';
                          statusColor = 'text-rose-400';
                      } else if (currentArrears > 0) {
                          statusText = 'Paid Base (Arrears Active)';
                          statusColor = 'text-rose-400';
                      } else {
                          statusText = 'Settled (Cycle)';
                          statusColor = 'text-teal-400';
                      }
                  }
                  
                  return (
                    <div key={debt.id} className={`rounded-xl border transition-all duration-300 overflow-hidden border-[#272b38] bg-[#161a23] ${isExpanded ? 'border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.1)]' : ''}`}>
                      <div className="p-4 sm:p-5 md:p-6 flex justify-between items-center gap-3">
                        <div className="space-y-1 sm:space-y-2">
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <span className="font-bold text-base sm:text-lg tracking-tight text-white leading-tight">{debt.creditor}</span>
                            {arrearsCount > 0 && (
                              <span className="text-[8px] sm:text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest">
                                Arrears (x{arrearsCount})
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[10px] sm:text-[11px] text-[#8a93a6] font-medium space-y-0.5 sm:space-y-1">
                            <p>Base: RM {n(debt.monthly_due).toFixed(2)}</p>
                            {currentArrears > 0 && <p className="text-rose-400">Arrears: +RM {currentArrears.toFixed(2)}</p>}
                            {n(debt.float_balance) > 0 && <p className="text-teal-400">Credit: -RM {n(debt.float_balance).toFixed(2)}</p>}
                          </div>
                          
                          <a href={`?month=${currentSelectedMonth}${isExpanded ? '' : `&details=${debt.id}`}${isEditing ? '&edit=true' : ''}`} className="text-[9px] sm:text-[10px] text-teal-400 hover:text-teal-300 mt-2 inline-block transition-colors uppercase tracking-widest font-bold">{isExpanded ? 'Hide ▲' : 'Details ▼'}</a>
                        </div>

                        {/* HIGHLY CUSTOM TRANSACTION-READY INPUT FIELD REPLICA */}
                        <div className="flex flex-col items-end gap-2 sm:gap-3 flex-shrink-0">
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-right mb-0.5">
                              <p className="font-bold text-xs sm:text-sm text-slate-400 tracking-tight">Net Statement: RM {statementTotalDue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                              {debtIsPaidThisMonth && (
                                <p className="text-[9px] font-bold text-teal-400 uppercase tracking-widest mt-0.5">Total Paid: RM {actualAmountPaid.toFixed(2)}</p>
                              )}
                            </div>
                            {isReadOnly ? (
                              <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border bg-[#0b0e14] ${debtIsPaidThisMonth ? 'text-teal-400 border-teal-500/20' : 'text-[#8a93a6] border-[#272b38]'}`}>
                                {debtIsPaidThisMonth ? 'Paid' : 'Outstanding'}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                {debtIsPaidThisMonth && (
                                  <form action={undoDebtPayment}>
                                    <input type="hidden" name="id" value={debt.id} />
                                    <input type="hidden" name="monthId" value={currentMonthId} />
                                    <button type="submit" className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-3 py-2 bg-[#0b0e14] text-[#8a93a6] border border-[#272b38] hover:bg-[#161a23] rounded-lg transition-all" title="Undo All Payments">
                                      Undo
                                    </button>
                                  </form>
                                )}
                                <form action={payDebt} className="flex items-center gap-1.5 sm:gap-2">
                                  <input type="hidden" name="id" value={debt.id} />
                                  <input type="hidden" name="monthId" value={currentMonthId} />
                                  <div className="flex items-center bg-[#0b0e14] border border-[#272b38] rounded-lg p-0.5 focus-within:border-amber-500/50 transition-colors">
                                    <span className="text-[#8a93a6] text-[10px] pl-2 font-mono">RM</span>
                                    <input 
                                      type="number" 
                                      step="0.01" 
                                      name="amountPaid" 
                                      defaultValue={Math.max(0, statementTotalDue - (debtIsPaidThisMonth ? actualAmountPaid : 0)).toFixed(2)} 
                                      className="w-16 sm:w-20 lg:w-24 bg-transparent text-right text-white text-xs outline-none py-1 px-1.5 font-mono"
                                    />
                                  </div>
                                  <button type="submit" className="text-[8px] sm:text-[9px] font-bold uppercase tracking-widest px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/40 hover:bg-amber-500/20 rounded-lg transition-all whitespace-nowrap">
                                    {debtIsPaidThisMonth ? '+ Add' : 'Pay Now'}
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* DARK TACTICAL CCRIS REPLICA */}
                      {isExpanded && (
                        <div className="bg-[#0b0e14] border-t border-[#272b38] p-4 sm:p-5 md:p-6 space-y-5 sm:space-y-6">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-sm sm:text-lg font-bold text-white">{debt.creditor}</h3>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] text-[#8a93a6] font-bold uppercase tracking-widest">Status</p>
                              <p className={`text-xs font-bold mt-1 ${statusColor}`}>{statusText}</p>
                            </div>
                          </div>

                          <div className="bg-[#161a23] border border-[#272b38] rounded-xl p-3 sm:p-4 flex justify-between items-center text-[9px] sm:text-[10px] font-bold text-[#8a93a6] uppercase tracking-widest">
                            <p>Since: <span className="text-white ml-1.5">{
                               debt.start_date ? new Date(debt.start_date).toLocaleDateString('en-MY') : 
                               (debt.date_since ? new Date(debt.date_since).toLocaleDateString('en-MY') : '28/11/2018')
                            }</span></p>
                            <p>Upd: <span className="text-white ml-1.5">{new Date().toLocaleDateString('en-MY')}</span></p>
                          </div>

                          <div className="bg-[#161a23] border border-[#272b38] rounded-xl p-4 sm:p-5 md:p-6">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Outstanding Principal</p>
                                <p className="text-xl sm:text-2xl font-bold text-white mt-1">RM {currentPrincipal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-bold text-[#8a93a6] uppercase tracking-widest">Facility Limit</p>
                                <p className="text-sm sm:text-lg font-bold text-white mt-1">RM {n(debt.original_loan_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-[#272b38] rounded-full mt-4 sm:mt-5">
                              <div className="h-full bg-teal-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(45,212,191,0.4)]" style={{ width: `${n(debt.original_loan_amount) > 0 ? (Math.max(0, n(debt.original_loan_amount) - currentPrincipal) / n(debt.original_loan_amount)) * 100 : 0}%` }} />
                            </div>
                          </div>

                          <div className="border-t border-[#272b38] pt-5 sm:pt-6 mt-4 sm:mt-6">
                            <h5 className="text-[10px] font-bold text-[#8a93a6] uppercase tracking-[0.15em] mb-4">12 Months Credit History</h5>
                            <div className="bg-[#161a23] border border-[#272b38] rounded-xl p-4 sm:p-5 md:p-6 overflow-hidden">
                              <div className="flex justify-between text-xs sm:text-sm font-bold text-white mb-4">
                                <span>{histFirstYear}</span>
                                {histFirstYear !== histLastYear && <span>{histLastYear}</span>}
                              </div>
                              
                              <div className="overflow-x-auto pb-4 pt-1 -mx-2 px-2 scrollbar-thin">
                                <div className="min-w-[480px] space-y-4">
                                  <div className="flex justify-between text-[9px] font-bold text-[#8a93a6] uppercase">
                                    {historyMonths.map((m: any) => <span key={m.monthId} className="w-6 md:w-8 text-center">{m.label}</span>)}
                                  </div>
                                  <div className="flex items-center">
                                    {historyMonths.map((m: any, i: number) => {
                                      let isTracked = true;
                                      if (debt.start_date && m.monthId < debt.start_date.substring(0, 7)) isTracked = false;
                                      if (debt.end_date && m.monthId > debt.end_date.substring(0, 7)) isTracked = false;

                                      const isMonthPaid = allDebtPayments.some((dp: any) => dp.debt_id == debt.id && dp.paid_month === m.monthId);
                                      const isFuture = m.monthId > currentMonthId;
                                      const isMonthCurrent = m.monthId === currentMonthId;
                                      
                                      let content = '';
                                      let bgClass = 'bg-[#0b0e14]'; 
                                      let textClass = 'text-transparent';
                                      let borderClass = 'border-transparent';

                                      if (isTracked) {
                                        if (isFuture) {
                                          bgClass = 'bg-[#0b0e14]';
                                        } else if (isMonthPaid && !isMonthCurrent) {
                                          content = '✓';
                                          bgClass = 'bg-teal-500/10';
                                          textClass = 'text-teal-400';
                                          borderClass = 'border-teal-500/40';
                                        } else if (isMonthCurrent) {
                                          if (isMonthPaid && actualAmountPaid >= n(debt.monthly_due) && arrearsCount === 0) {
                                              content = '✓';
                                              bgClass = 'bg-teal-500/10';
                                              textClass = 'text-teal-400';
                                              borderClass = 'border-teal-500/40';
                                          } else if (isMonthPaid && actualAmountPaid < n(debt.monthly_due)) {
                                              content = 'P'; // Indicates Partial Payment Fallback
                                              textClass = 'text-rose-400';
                                              bgClass = 'bg-rose-500/10';
                                              borderClass = 'border-rose-500/40';
                                          } else if (arrearsCount > 0) {
                                              content = String(arrearsCount);
                                              textClass = 'text-rose-400';
                                              bgClass = 'bg-rose-500/5';
                                              borderClass = 'border-rose-500/30';
                                          } else {
                                              content = '0';
                                              bgClass = 'bg-[#161a23]';
                                              borderClass = 'border-[#383e52] border-dashed';
                                          }
                                        } else {
                                          // Displays the verified credit index for unpaid past months
                                          content = arrearsCount > 0 ? String(arrearsCount) : '1';
                                          bgClass = 'bg-rose-500/10';
                                          textClass = 'text-rose-400';
                                          borderClass = 'border-rose-500/40';
                                        }
                                      }

                                      const nextMonth = historyMonths[i + 1];
                                      let nextIsTracked = true;
                                      if (nextMonth) {
                                        if (debt.start_date && nextMonth.monthId < debt.start_date.substring(0, 7)) nextIsTracked = false;
                                        if (debt.end_date && nextMonth.monthId > debt.end_date.substring(0, 7)) nextIsTracked = false;
                                      }
                                      
                                      const nextIsFuture = nextMonth && nextMonth.monthId > currentMonthId;
                                      const lineClass = (isTracked && nextIsTracked && !nextIsFuture) ? 'bg-[#383e52]' : 'bg-[#0b0e14]';

                                      return (
                                        <div key={m.monthId} className="flex-1 flex items-center">
                                          <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold z-10 border transition-all duration-500 ${bgClass} ${textClass} ${borderClass}`}>
                                            {content}
                                          </div>
                                          {i < 11 && <div className={`flex-1 h-0.5 -mx-0.5 md:-mx-1 ${lineClass}`} />}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-center gap-3 sm:gap-6 mt-4 text-[9px] text-[#8a93a6] font-bold uppercase tracking-widest flex-wrap">
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-500/10 border border-teal-500/40"></span> Paid (Full)</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#161a23] border border-[#383e52] border-dashed"></span> Pending</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500/10 border border-rose-500/40"></span> Arrears / Partial</span>
                                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0b0e14]"></span> Untracked</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* BSKL INVESTMENT ACCOUNT */}
              <div className="mt-8 pt-2">
                <div className="flex justify-between items-center mb-4 pl-1">
                  <h2 className="text-[11px] font-semibold uppercase text-[#8a93a6] tracking-[0.15em]">Investment Account</h2>
                  <span className="border border-blue-500/30 text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest">BSKL</span>
                </div>
                <div className="bg-[#161a23] border border-[#272b38] rounded-xl shadow-sm overflow-hidden hover:border-[#383e52] transition-colors">
                  {enrichedContracts.length === 0 ? (
                    <div className="p-5 border-b border-[#272b38]">
                       <h3 className="text-lg font-bold text-[#8a93a6]">No Active Contracts</h3>
                    </div>
                  ) : (
                    enrichedContracts.map((c: any, idx: number) => (
                      <div key={c.id} className={`p-4 sm:p-6 ${idx !== enrichedContracts.length - 1 ? 'border-b border-[#272b38]' : 'border-b-4 border-[#0b0e14]'} flex flex-col gap-4 sm:gap-5`}>
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">{c.name}</h3>
                              {!c.is_active && <span className="text-[8px] bg-[#0b0e14] text-[#8a93a6] px-1.5 py-0.5 rounded border border-[#383e52] uppercase tracking-widest">ENDED</span>}
                            </div>
                            <p className="text-[10px] text-[#8a93a6] mt-1 tracking-widest uppercase">RM {n(c.daily_rate).toFixed(2)} / Trading Day</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-[9px] font-bold uppercase tracking-widest ${c.isProfit ? 'text-teal-500' : 'text-[#8a93a6]'}`}>
                              {c.isProfit ? 'Capital ROI' : 'Capital Bal'}
                            </p>
                            <p className={`text-base sm:text-xl font-bold mt-1 tracking-tight ${c.isProfit ? 'text-teal-400' : 'text-white'}`}>
                              RM {c.displayAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} <span className="text-[10px] sm:text-xs font-medium opacity-70">({c.displayPct.toFixed(0)}%)</span>
                            </p>
                          </div>
                        </div>
                        
                        {/* Minimalist Border Progress Bar */}
                        <div className="w-full h-px bg-[#272b38] relative mt-1">
                          {/* Green Base Bar (Capital Recovery up to 100%) */}
                          <div 
                            className="absolute top-0 left-0 h-full bg-teal-500/60 shadow-[0_0_8px_rgba(45,212,191,0.4)] transition-all duration-1000 ease-out" 
                            style={{ width: `${c.greenWidth}%` }}
                          />
                          {/* Blue Overlay Bar (Profit > 100%) */}
                          {c.blueWidth > 0 && (
                            <div 
                              className="absolute top-0 left-0 h-full bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.6)] transition-all duration-1000 ease-out z-10" 
                              style={{ width: `${c.blueWidth}%` }}
                            />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="p-3 sm:p-6 bg-[#0b0e14]">
                    <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day: string) => (
                        <div key={day} className="text-center text-[8px] sm:text-[9px] font-bold text-[#8a93a6] uppercase tracking-widest">{day}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                      {Array.from({ length: firstDayOfWeek }).map((_, i: number) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, i: number) => {
                        const day = i + 1;
                        const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayOfWeek = new Date(year, monthIndex, day).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        const isHoliday = bsklHolidays.some((h: any) => h.holiday_date === dateStr);
                        const dayContracts = enrichedContracts.filter((c: any) => {
                           if (isWeekend || isHoliday) return false;
                           const cEffDate = c.effective_date;
                           const cEndDate = c.end_date || '2099-12-31';
                           return dateStr >= cEffDate && dateStr <= cEndDate;
                        });
                        if (dayContracts.length === 0) {
                          return (
                            <div key={day} className="aspect-square rounded bg-[#0b0e14] flex flex-col items-center justify-center text-[#383e52] font-bold text-[9px] sm:text-xs border border-[#272b38]/40">
                              {day}
                            </div>
                          );
                        }
                        if (dayContracts.length === 1) {
                           const c = dayContracts[0];
                           const isPaid = bsklPayments.some((p: any) => p.contract_id === c.id && p.paid_date === dateStr);
                           if (isReadOnly) {
                             return (
                               <div key={day} className={`aspect-square rounded flex flex-col items-center justify-center border p-0.5 sm:p-1 gap-0.5 ${isPaid ? 'bg-teal-500/10 border-teal-500/30' : 'bg-[#161a23] border-[#383e52]'}`}>
                                 <span className={`text-[8px] sm:text-[9px] font-normal leading-none ${isPaid ? 'text-teal-400/60' : 'text-[#8a93a6]/60'}`}>{day}</span>
                                 <span className={`text-[8px] sm:text-[11px] font-bold leading-none ${isPaid ? 'text-teal-400' : 'text-[#8a93a6]'}`}>{c.daily_rate}</span>
                               </div>
                             );
                           }
                           return (
                             <form key={day} action={toggleBsklPayment} className="aspect-square">
                               <input type="hidden" name="contract_id" value={c.id} />
                               <input type="hidden" name="date" value={dateStr} />
                               <input type="hidden" name="amount" value={c.daily_rate} />
                               <input type="hidden" name="isPaid" value={String(isPaid)} />
                               <button type="submit" className={`w-full h-full rounded flex flex-col items-center justify-center transition-all border p-0.5 sm:p-1 gap-0.5 ${isPaid ? 'bg-teal-500/10 border-teal-500/30 hover:bg-teal-500/20' : 'bg-[#161a23] border-[#383e52] hover:border-amber-500/40'}`}>
                                 <span className={`text-[8px] sm:text-[9px] font-normal leading-none ${isPaid ? 'text-teal-400/60' : 'text-[#8a93a6]/60'}`}>{day}</span>
                                 <span className={`text-[8px] sm:text-[11px] font-bold leading-none ${isPaid ? 'text-teal-400' : 'text-[#8a93a6]'}`}>{c.daily_rate}</span>
                               </button>
                             </form>
                           );
                        }
                        return (
                          <a key={day} href={`?month=${currentSelectedMonth}&bsklModal=${dateStr}${isEditing ? '&edit=true' : ''}`} className="aspect-square rounded flex flex-col items-center justify-center transition-all border bg-[#161a23] border-[#383e52] hover:border-amber-500/40 p-0.5 sm:p-1 gap-0.5">
                             <span className="text-[8px] sm:text-[9px] font-normal text-[#8a93a6]/60 leading-none">{day}</span>
                             {dayContracts.map((c: any) => {
                                const isPaid = bsklPayments.some((p: any) => p.contract_id === c.id && p.paid_date === dateStr);
                                return <span key={c.id} className={`text-[8px] md:text-[9px] font-bold leading-none ${isPaid ? 'text-teal-400' : 'text-[#8a93a6]'}`}>{c.daily_rate}</span>
                             })}
                          </a>
                        )
                      })}
                    </div>
                    <div className="flex gap-3 sm:gap-4 mt-6 justify-center text-[9px] font-bold text-[#8a93a6] uppercase tracking-widest flex-wrap">
                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-[#161a23] border border-[#383e52]"></div> Trading Day</span>
                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-teal-500/10 border border-teal-500/30"></div> Collected</span>
                      <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-[#0b0e14] border border-[#272b38]/50"></div> Closed / Holiday</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CASH INFLOW ACCOUNT */}
              <div className="mt-8 pt-2">
                <div className="flex justify-between items-center mb-4 pl-1">
                  <h2 className="text-[11px] font-semibold uppercase text-[#8a93a6] tracking-[0.15em]">Cash Inflow</h2>
                  <span className="border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest">LIQUIDITY</span>
                </div>
                <div className="bg-[#161a23] border border-[#272b38] rounded-xl shadow-sm overflow-hidden hover:border-[#383e52] transition-colors p-4 sm:p-5 md:p-6">
                   
                   {!isReadOnly && (
                      <form action={addCashInflow} className="flex flex-col sm:flex-row gap-3 mb-6">
                          <input type="hidden" name="monthId" value={currentMonthId} />
                          <div className="flex-1">
                             <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Particular</label>
                             <input name="particular" type="text" required placeholder="e.g. Freelance Design" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500/50 transition-colors" />
                          </div>
                          <div className="w-full sm:w-1/3">
                             <label className="text-[9px] text-[#8a93a6] block mb-1.5 uppercase tracking-widest font-bold">Amount (RM)</label>
                             <input name="amount" type="number" step="0.01" required placeholder="0.00" className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500/50 transition-colors" />
                          </div>
                          <div className="flex items-end">
                             <button type="submit" className="w-full sm:w-auto bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 font-bold py-2 px-6 rounded-lg transition-colors text-[10px] uppercase tracking-widest h-[34px] flex items-center justify-center">Execute</button>
                          </div>
                      </form>
                   )}

                   {/* Mini Sub-Ledger for Inflows */}
                   <div className="bg-[#0b0e14] rounded-lg border border-[#272b38] p-3 space-y-1.5 font-mono text-[9px] text-[#8a93a6] max-h-[150px] overflow-y-auto scrollbar-thin">
                      <div className="flex justify-between items-center border-b border-[#272b38]/50 pb-1.5 mb-1.5">
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Sub-Ledger Transactions</p>
                        <a href={`?month=${currentSelectedMonth}&log=true${isEditing ? '&edit=true' : ''}`} className="text-[7px] bg-[#161a23] text-emerald-400 border border-[#383e52] hover:border-emerald-500/40 hover:bg-emerald-500/10 px-2 py-0.5 rounded transition-all uppercase tracking-widest shadow-sm">
                          Details &raquo;
                        </a>
                      </div>
                      {cashInflows.filter((i: any) => i.month_id === currentMonthId).length === 0 && <p className="text-center py-2 opacity-50">No inflows recorded this month.</p>}
                      {cashInflows.filter((i: any) => i.month_id === currentMonthId).map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center">
                          <span className="w-20 truncate">{new Date(item.created_at).toLocaleDateString('en-MY')}</span>
                          <span className="flex-1 uppercase tracking-wide text-[8px] opacity-80 truncate px-2">[{item.particular}]</span>
                          <span className="font-bold text-emerald-400">+RM {Number(item.amount).toFixed(2)}</span>
                        </div>
                      ))}
                   </div>

                </div>
              </div>
            </section>
            
            {/* RIGHT COLUMN: OPERATING BUDGETS */}
            <section className="space-y-4">
              <div className="flex justify-between items-center pl-1">
                <h2 className="text-[11px] font-semibold uppercase text-[#8a93a6] tracking-[0.15em]">Operating Budgets</h2>
                <span className="border border-teal-500/30 text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest">{formattedMonthDisplay.split(' ')[0]}</span>
              </div>

              {budgets?.length === 0 ? (
                <div className="bg-[#161a23] border border-[#272b38] border-dashed rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-4 sm:gap-5">
                  <p className="text-[#8a93a6] text-sm">No operating budgets allocated for {formattedMonthDisplay} yet.</p>
                  {!isReadOnly && (
                    <form action={duplicatePreviousBudgets}>
                      <input type="hidden" name="currentMonth" value={currentSelectedMonth} />
                      <input type="hidden" name="prevMonth" value={prevMonthStr} />
                      <button type="submit" className="text-xs font-bold uppercase tracking-widest px-5 py-2.5 sm:px-6 sm:py-3 rounded-full border border-teal-500/40 text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 transition-all shadow-[0_0_10px_rgba(20,184,166,0.1)]">
                        Import Previous Month's Budgets
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="bg-[#161a23] border border-[#272b38] rounded-xl divide-y divide-[#272b38] overflow-hidden shadow-sm">
                  {budgets?.map((budget: any) => {
                    const allocated = n(budget.allocated_amount);
                    const spent = n(budget.spent_amount);
                    const remaining = Math.max(0, allocated - spent);
                    const remainingPct = allocated > 0 ? Math.max(0, Math.min(100, (remaining / allocated) * 100)) : 0;
                    const logs = budgetTransactions.filter((t: any) => t.budget_id === budget.id);

                    return (
                      <div key={budget.id} className={`p-4 sm:p-5 md:p-6 flex flex-col gap-4 sm:gap-5 transition-all ${budget.is_saved ? 'bg-teal-500/5 border-l-2 border-teal-500/50' : 'hover:bg-[#1a1e28]'}`}>
                        
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <span className={`text-base sm:text-lg font-bold tracking-tight leading-tight ${budget.is_saved ? 'text-[#8a93a6] line-through' : 'text-white'}`}>{budget.category}</span>
                            <span className="text-[9px] sm:text-[10px] text-[#8a93a6] font-mono bg-[#0b0e14] border border-[#272b38] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md uppercase tracking-wider flex-shrink-0">Allocated: RM {allocated.toFixed(2)}</span>
                          </div>
                          
                          {/* Minimalist Border Progress Bar */}
                          <div className="w-full h-px bg-[#272b38] mt-3 sm:mt-4">
                            <div 
                              className={`h-full transition-all duration-1000 ease-out ${budget.is_saved ? 'bg-teal-500/20' : (remainingPct <= 20 ? 'bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-teal-500/60 shadow-[0_0_8px_rgba(45,212,191,0.3)]')}`} 
                              style={{ width: `${remainingPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col xl:flex-row justify-between xl:items-end gap-4 sm:gap-5">
                          {isReadOnly ? (
                            <div className="flex-1 bg-[#0b0e14] p-3 rounded-lg border border-[#272b38] xl:max-w-xs">
                              <p className="text-[9px] text-[#8a93a6] font-bold uppercase tracking-[0.1em] mb-1">Spent Amount</p>
                              <p className="font-mono text-white text-sm font-bold">RM {spent.toFixed(2)}</p>
                            </div>
                          ) : (
                            <div className="flex-1 space-y-2">
                              <label className="text-[9px] text-[#8a93a6] uppercase tracking-[0.1em] font-bold block">Execute Transaction / Virement (RM)</label>
                              <form action={executeBudgetAction} className="space-y-3">
                                <input type="hidden" name="budgetId" value={budget.id} />
                                <input type="hidden" name="currentAllocated" value={allocated} />
                                <input type="hidden" name="currentSpent" value={spent} />
                                <input name="amount" type="number" step="0.01" placeholder="0.00" disabled={budget.is_saved} className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-2.5 py-2 text-white text-sm outline-none disabled:opacity-50 focus:border-amber-500/50 transition-colors" />
                                {!budget.is_saved && (
                                  <div className="grid grid-cols-3 gap-2">
                                    <button type="submit" name="actionType" value="spent" className="text-[9px] sm:text-[10px] uppercase tracking-widest font-black py-2.5 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-600 hover:text-white transition-all shadow-[0_0_8px_rgba(225,29,72,0.1)]">Spent</button>
                                    <button type="submit" name="actionType" value="add" className="text-[9px] sm:text-[10px] uppercase tracking-widest font-black py-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-[0_0_8px_rgba(16,185,129,0.1)]">Add</button>
                                    <button type="submit" name="actionType" value="reduce" className="text-[9px] sm:text-[10px] uppercase tracking-widest font-black py-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-[0_0_8px_rgba(37,99,235,0.1)]">Reduce</button>
                                  </div>
                                )}
                              </form>
                            </div>
                          )}

                          <div className="xl:text-right bg-[#0b0e14] p-3 rounded-lg border border-[#272b38] flex-1 xl:flex-none xl:min-w-[140px]">
                            <p className="text-[9px] text-[#8a93a6] font-bold uppercase tracking-[0.1em] mb-1">Remaining</p>
                            <p className={`font-bold text-lg sm:text-xl tracking-tight ${budget.is_saved ? 'text-teal-400/40' : (remainingPct <= 20 ? 'text-rose-400' : 'text-teal-400')}`}>RM {remaining.toFixed(2)}</p>
                          </div>
                        </div>

                        {logs.length > 0 && (
                          <div className="bg-[#0b0e14] rounded-lg border border-[#272b38] p-3 space-y-1.5 font-mono text-[9px] text-[#8a93a6] max-h-[110px] overflow-y-auto scrollbar-thin">
                            <div className="flex justify-between items-center border-b border-[#272b38]/50 pb-1.5 mb-1.5">
                              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Sub-Ledger Transactions</p>
                              <a href={`?month=${currentSelectedMonth}&log=true${isEditing ? '&edit=true' : ''}`} className="text-[7px] bg-[#161a23] text-teal-400 border border-[#383e52] hover:border-teal-500/40 hover:bg-teal-500/10 px-2 py-0.5 rounded transition-all uppercase tracking-widest shadow-sm">
                                Details &raquo;
                              </a>
                            </div>
                            {logs.map((log: any) => {
                              let prefix = '-'
                              let colorClass = 'text-rose-400'
                              if (log.transaction_type === 'add') { prefix = '+'; colorClass = 'text-emerald-400'; }
                              if (log.transaction_type === 'reduce') { prefix = '-'; colorClass = 'text-blue-400'; }
                              return (
                                <div key={log.id} className="flex justify-between items-center">
                                  <span>{new Date(log.created_at).toLocaleDateString('en-MY')}</span>
                                  <span className="uppercase tracking-wide text-[8px] opacity-60">[{log.transaction_type}]</span>
                                  <span className={`font-bold ${colorClass}`}>{prefix}RM {Number(log.amount).toFixed(2)}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="border-t border-[#272b38]/50 pt-3 sm:pt-4 flex justify-end">
                          {budget.is_saved ? (
                            <div className="flex items-center gap-3 sm:gap-4 bg-[#0b0e14] px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-[#272b38]">
                              <span className="text-[9px] uppercase tracking-widest font-bold text-teal-500 flex items-center gap-1.5">
                                <span className="w-3 sm:w-3.5 h-3 sm:h-3.5 rounded-full bg-teal-500/20 flex items-center justify-center text-[8px] sm:text-[10px]">✓</span>In Pool
                              </span>
                              {!isReadOnly && (
                                <>
                                  <div className="w-px h-4 bg-[#272b38]"></div>
                                  <form action={undoSavings}>
                                    <input type="hidden" name="id" value={budget.id} />
                                    <button type="submit" className="text-[9px] uppercase tracking-widest font-bold text-[#8a93a6] hover:text-white transition-colors">Undo</button>
                                  </form>
                                </>
                              )}
                            </div>
                          ) : (
                            !isReadOnly && (
                              <form action={sendToSavings}>
                                <input type="hidden" name="id" value={budget.id} />
                                <button type="submit" disabled={remaining <= 0} className="text-[10px] uppercase tracking-widest font-bold px-4 py-2 sm:px-5 sm:py-2.5 rounded-full border border-teal-500/40 text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 transition-all disabled:opacity-30 disabled:hover:bg-teal-500/10">Approve & Send to Pool</button>
                              </form>
                            )
                          )}
                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  )
}