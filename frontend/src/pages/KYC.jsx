import { useState } from 'react'
import { usersAPI } from '../services/api'
import { FileText, Camera, MapPin, CheckCircle, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'

export default function KYC() {
  const [step, setStep] = useState(1) // 1: Info, 2: Upload, 3: Selfie, 4: Done
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    docType: 'passport',
    docNumber: '',
    address: '',
    idImage: '',
    selfieImage: ''
  })

  const submitKYC = async () => {
    setLoading(true)
    try {
      await usersAPI.submitKYC(form)
      setStep(4)
      toast.success("Verification submitted!")
    } catch { toast.error("Submission failed") }
    finally { setLoading(false) }
  }

  if (step === 4) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
       <div className="bg-noir-700 border border-noir-400 p-12 rounded-[40px] text-center max-w-md shadow-2xl">
          <CheckCircle size={80} className="text-green-500 mx-auto mb-6" />
          <h2 className="text-3xl font-display text-ink-primary mb-4">Documents Received</h2>
          <p className="text-ink-secondary leading-relaxed">
            Our compliance team is verifying your identity. You will be notified via email once your accounts are activated.
          </p>
          <div className="mt-8 pt-8 border-t border-noir-400">
             <p className="text-xs text-ink-muted uppercase tracking-widest">Est. Verification Time</p>
             <p className="text-gold font-medium">1 - 4 Hours</p>
          </div>
       </div>
    </div>
  )

  return (
    <div className="max-w-xl mx-auto py-12 px-6">
      <div className="flex justify-between mb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 w-full rounded-full mx-1 ${step >= i ? 'bg-gold' : 'bg-noir-400'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-slide-up">
          <div className="mb-8">
            <h1 className="text-3xl font-display text-ink-primary">Identity Details</h1>
            <p className="text-ink-secondary mt-2">Enter your government-issued ID information.</p>
          </div>
          <div className="space-y-4">
            <label className="field-label">Document Type</label>
            <select className="field-select" onChange={e => setForm({...form, docType: e.target.value})}>
              <option value="passport">International Passport</option>
              <option value="national_id">National ID Card</option>
              <option value="driver_license">Driver's License</option>
            </select>
            <label className="field-label">ID Number</label>
            <input className="field-input" placeholder="Enter ID number" onChange={e => setForm({...form, docNumber: e.target.value})} />
            <label className="field-label">Residential Address</label>
            <textarea className="field-input h-24" placeholder="Full legal address" onChange={e => setForm({...form, address: e.target.value})} />
          </div>
          <button className="btn-gold w-full py-4 mt-6 text-lg" onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-slide-up">
          <h2 className="text-2xl text-ink-primary flex items-center gap-3"><FileText className="text-gold" /> Upload ID Document</h2>
          <p className="text-ink-secondary">Upload a clear photo of the front of your document.</p>
          <div className="border-2 border-dashed border-noir-400 rounded-3xl p-12 text-center hover:border-gold/50 transition-colors cursor-pointer bg-noir-800/50" onClick={() => setForm({...form, idImage: 'uploaded_id_url'})}>
             <ShieldCheck size={48} className="mx-auto mb-4 text-ink-muted" />
             <p className="text-ink-muted">Click to select file or drag & drop</p>
          </div>
          <div className="flex gap-4">
             <button className="btn-ghost flex-1" onClick={() => setStep(1)}>Back</button>
             <button className="btn-gold flex-[2]" onClick={() => setStep(3)}>Continue</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-slide-up">
          <h2 className="text-2xl text-ink-primary flex items-center gap-3"><Camera className="text-gold" /> Face Verification</h2>
          <p className="text-ink-secondary">Please take a selfie holding your ID next to your face.</p>
          <div className="aspect-square rounded-full border-4 border-noir-400 max-w-[250px] mx-auto overflow-hidden bg-noir-800 flex items-center justify-center">
             <Camera size={48} className="text-noir-400" />
          </div>
          <div className="flex gap-4 mt-10">
             <button className="btn-ghost flex-1" onClick={() => setStep(2)}>Back</button>
             <button className="btn-gold flex-[2] py-4" onClick={submitKYC} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Final Verification'}
             </button>
          </div>
        </div>
      )}
    </div>
  )
}