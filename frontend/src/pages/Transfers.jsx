import { useState, useEffect } from 'react'
import { transfersAPI, accountsAPI } from '../services/api'
import toast from 'react-hot-toast'

export default function Transfers() {
  const [tab, setTab] = useState('local')
  const [accounts, setAccounts] = useState([])
  const [beneficiaries, setBeneficiaries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fromAccountId: '',
    recipientName: '',
    recipientAccount: '',
    recipientBank: '',
    swiftCode: '',
    iban: '',
    amount: '',
    description: '',
    toAccountNumber: '',
    cotCode: '',
    taxCode: '',
    imfCode: ''
  })

  useEffect(() => {
    const fetchData = async () => {
      // FIX 4: Surface account loading errors so fromAccountId is never silently empty
      try {
        const r1 = await accountsAPI.getAll()
        const accs = r1.data.data.accounts
        setAccounts(accs)
        if (accs.length) setForm(p => ({ ...p, fromAccountId: accs[0].id }))
        else toast.error('No accounts found. Please contact support.')
      } catch (e) {
        console.error('Failed to load accounts:', e)
        toast.error('Failed to load your accounts. Please refresh the page.')
      }

      try {
        const r2 = await transfersAPI.getBeneficiaries()
        setBeneficiaries(r2.data.data.beneficiaries || [])
      } catch (e) {
        // Beneficiaries failing is non-critical — just log it
        console.warn('Failed to load beneficiaries:', e)
      }
    }
    fetchData()
  }, [])

  const setField = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  // FIX 1: Sanitize amount — strip commas/spaces before sending so "1,000" works
  const sanitizeAmount = val => parseFloat(String(val).replace(/,/g, '').trim()) || 0

  const submit = async () => {
    // FIX 4: Guard against empty fromAccountId before even sending the request
    if (!form.fromAccountId) {
      toast.error('No account selected. Please refresh the page.')
      return
    }
    if (!form.recipientName.trim()) {
      toast.error('Recipient name is required')
      return
    }
    const parsedAmount = sanitizeAmount(form.amount)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Please enter a valid amount greater than 0')
      return
    }
    if (tab === 'local' && !form.toAccountNumber.trim()) {
      toast.error('Recipient account number is required')
      return
    }
    if ((tab === 'international' || tab === 'wire') && (!form.recipientAccount.trim() || !form.recipientBank.trim() || !form.swiftCode.trim())) {
      toast.error('Recipient account, bank name, and SWIFT code are all required')
      return
    }
    if (tab === 'wire' && (!form.cotCode.trim() || !form.taxCode.trim() || !form.imfCode.trim())) {
      toast.error('COT, Tax, and IMF codes are required for wire transfers')
      return
    }

    setLoading(true)
    try {
      let payload = {
        fromAccountId: form.fromAccountId,
        recipientName: form.recipientName.trim(),
        amount: parsedAmount, // FIX 1: always send a clean float
        description: form.description
      }

      if (tab === 'local') {
        payload.toAccountNumber = form.toAccountNumber.trim()
        await transfersAPI.local(payload)
      } else if (tab === 'international') {
        payload = {
          ...payload,
          recipientAccount: form.recipientAccount.trim(),
          recipientBank: form.recipientBank.trim(),
          swiftCode: form.swiftCode.trim(),
          iban: form.iban.trim() || ''
        }
        await transfersAPI.international(payload)
      } else if (tab === 'wire') {
        payload = {
          ...payload,
          recipientAccount: form.recipientAccount.trim(),
          recipientBank: form.recipientBank.trim(),
          swiftCode: form.swiftCode.trim(),
          iban: form.iban.trim() || '',
          cotCode: form.cotCode.trim(),
          taxCode: form.taxCode.trim(),
          imfCode: form.imfCode.trim()
        }
        await transfersAPI.wire(payload)
      }

      toast.success('Transfer initiated!')
      setForm(prev => ({
        ...prev,
        recipientName: '',
        recipientAccount: '',
        recipientBank: '',
        swiftCode: '',
        iban: '',
        amount: '',
        description: '',
        toAccountNumber: '',
        cotCode: '',
        taxCode: '',
        imfCode: ''
      }))
    } catch (err) {
      console.error(err.response?.data)
      // FIX 5: Show the clearest available error message from the server
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        err.response?.data?.errors?.map(e => `${e.param}: ${e.msg}`).join(', ') ||
        'Transfer failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Reusable Input component with autoComplete off
  const F = ({ label, name, type = 'text', placeholder }) => (
    <div>
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        type={type}
        placeholder={placeholder}
        value={form[name]}
        onChange={setField(name)}
        autoComplete="off"
      />
    </div>
  )
  if (loading || !accounts) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-t-gold border-noir-400 rounded-full animate-spin" />
    </div>
  );
};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-light text-ink-primary">Transfers</h1>
        <p className="text-ink-secondary text-sm mt-1">Send money locally or internationally</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-noir-700 border border-noir-400 rounded-xl p-1 w-fit">
        {['local', 'international', 'wire'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab-item capitalize ${tab === t ? 'active' : ''}`}
          >
            {t === 'wire' ? 'Wire' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 bg-noir-700 border border-noir-400 rounded-2xl p-7 space-y-5">

          {/* FIX 4: Show warning if no accounts loaded */}
          {accounts.length === 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              No accounts loaded. Please refresh the page or contact support.
            </div>
          )}

          <div>
            <label className="field-label">From Account</label>
            <select
              className="field-select"
              value={form.fromAccountId}
              onChange={setField('fromAccountId')}
              autoComplete="off"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.accountType} — {a.accountNumber} (${Number(a.balance || 0).toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <F label="Recipient Name" name="recipientName" placeholder="Full name" />
          {tab === 'local' ? (
            <F label="Recipient Account Number" name="toAccountNumber" placeholder="Account number" />
          ) : (
            <>
              <F label="Account / IBAN" name="recipientAccount" placeholder="Account number or IBAN" />
              <F label="Bank Name" name="recipientBank" placeholder="Bank name" />
              <F label="SWIFT / BIC Code" name="swiftCode" placeholder="SWIFT code" />
              <F label="IBAN (optional)" name="iban" placeholder="IBAN" />
            </>
          )}
          {tab === 'wire' && (
            <>
              {/* FIX 3: Mention the $45 fee clearly so users aren't surprised by insufficient funds */}
              <div className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 text-sm text-gold">
                Wire transfers require COT, Tax, and IMF validation codes. A $45 processing fee will be added to your transfer amount.
              </div>
              <F label="COT Code" name="cotCode" placeholder="Min 5 characters" />
              <F label="Tax Code" name="taxCode" placeholder="Min 5 characters" />
              <F label="IMF Code" name="imfCode" placeholder="Min 5 characters" />
            </>
          )}
          {tab === 'international' && (
            <div className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 text-sm text-gold">
              A $45 processing fee will be added to your transfer amount.
            </div>
          )}

          <F label="Amount (USD)" name="amount" type="text" placeholder="0.00" />
          <F label="Description (optional)" name="description" placeholder="Payment reference…" />

          <button
            className="btn-gold w-full justify-center"
            onClick={submit}
            disabled={loading || !form.amount || !form.recipientName || !form.fromAccountId}
          >
            {loading
              ? 'Processing…'
              : `Send ${tab === 'wire' ? 'Wire' : tab === 'international' ? 'International' : 'Local'} Transfer`}
          </button>
        </div>

        {/* Beneficiaries */}
        <div className="lg:col-span-2">
          <p className="text-[11px] uppercase tracking-widest text-ink-muted mb-3">Saved Beneficiaries</p>
          <div className="bg-noir-700 border border-noir-400 rounded-2xl overflow-hidden">
            {beneficiaries.length === 0 && (
              <div className="py-10 text-center text-ink-muted text-sm">No beneficiaries saved</div>
            )}
            {beneficiaries.map((b, i) => (
              <div
                key={b.id}
                className={`px-4 py-3.5 hover:bg-noir-600 cursor-pointer transition-colors ${
                  i < beneficiaries.length - 1 ? 'border-b border-noir-400' : ''
                }`}
                onClick={() =>
                  setForm(p => ({
                    ...p,
                    recipientName: b.name,
                    toAccountNumber: b.accountNumber,
                    recipientAccount: b.accountNumber,
                    recipientBank: b.bankName,
                    swiftCode: b.swiftCode || ''
                  }))
                }
              >
                <div className="text-sm font-medium text-ink-primary">{b.name}</div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {b.bankName} · {b.accountNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}