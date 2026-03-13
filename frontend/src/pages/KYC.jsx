import { useState, useRef } from 'react'
import { usersAPI } from '../services/api'
import { FileText, Camera, CheckCircle, ShieldCheck, Upload, RefreshCcw, Landmark } from 'lucide-react'
import toast from 'react-hot-toast'

export default function KYC() {
  const [step, setStep] = useState(1) 
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    docType: 'passport',
    docNumber: '',
    address: '',
    idFront: null,
    idBack: null,
    selfieImage: null
  })

  // Camera Refs
  const videoRef = useRef(null)
  const [stream, setStream] = useState(null)

  // Handle File Uploads (Front & Back)
  const handleFile = (e, side) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setForm(prev => ({ ...prev, [side]: reader.result }))
        toast.success(`${side.replace('id', 'ID ')} attached`)
      }
      reader.readAsDataURL(file)
    }
  }

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      videoRef.current.srcObject = s
      setStream(s)
    } catch (err) {
      toast.error("Camera access denied")
    }
  }

  const takeSelfie = () => {
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    setForm(prev => ({ ...prev, selfieImage: canvas.toDataURL('image/jpeg') }))
    stream.getTracks().forEach(t => t.stop())
    setStream(null)
    toast.success("Selfie captured!")
  }

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
          <h2 className="text-3xl font-display text-ink-primary mb-4">Verification Sent</h2>
          <p className="text-ink-secondary leading-relaxed">Our compliance team is reviewing your documents. Activation takes 1-12 hours.</p>
          <button className="btn-gold w-full mt-10 py-4" onClick={() => window.location.reload()}>Check My Status</button>
       </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      {/* Progress Bar */}
      <div className="flex justify-between mb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 w-full rounded-full mx-1 transition-all duration-500 ${step >= i ? 'bg-gold' : 'bg-noir-400'}`} />
        ))}
      </div>

      {/* STEP 1: Personal Details */}
      {step === 1 && (
        <div className="space-y-6 animate-slide-up">
          <h1 className="text-4xl font-display text-ink-primary">Identity Details</h1>
          <p className="text-ink-secondary">Fill in your legal document information to proceed.</p>
          <div className="space-y-5 pt-4">
            <div>
              <label className="field-label">Full Legal Name</label>
              <input 
                className="field-input" 
                placeholder="e.g. John Fitzgerald Doe" 
                value={form.fullName} 
                onChange={e => setForm({...form, fullName: e.target.value})} 
              />
            </div>
            <label className="field-label">ID Number</label>
            <input className="field-input" placeholder="e.g. A1234567" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} />
            
            <label className="field-label">Legal Residential Address</label>
            <textarea className="field-input h-28" placeholder="Current address including City, Zip, and Country" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          </div>
          <button 
            className="btn-gold w-full py-4 mt-6 text-lg disabled:opacity-50" 
            disabled={!form.docNumber || !form.address}
            onClick={() => setStep(2)}
          >
            Continue to Upload
          </button>
        </div>
      )}

      {/* STEP 2: ID Uploads (Front & Back) */}
      {step === 2 && (
        <div className="space-y-8 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="bg-gold/10 p-2 rounded-xl text-gold"><FileText size={24}/></div>
            <h2 className="text-3xl font-display text-ink-primary">Document Upload</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FRONT */}
            <label className="cursor-pointer group">
              <p className="text-sm text-ink-muted mb-3 uppercase tracking-widest">ID Front Side</p>
              <div className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all min-h-[220px] flex flex-col items-center justify-center
                ${form.idFront ? 'border-green-500/50 bg-green-500/5' : 'border-noir-400 group-hover:border-gold/50 bg-noir-800/50'}`}>
                {form.idFront ? <img src={form.idFront} className="max-h-32 rounded-lg" alt="Front Preview" /> : <Upload className="text-ink-muted group-hover:text-gold mb-3" />}
                <p className="text-xs text-ink-muted mt-2">{form.idFront ? "Front Captured" : "Click to upload front"}</p>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e, 'idFront')} />
              </div>
            </label>

            {/* BACK */}
            <label className="cursor-pointer group">
              <p className="text-sm text-ink-muted mb-3 uppercase tracking-widest">ID Back Side</p>
              <div className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all min-h-[220px] flex flex-col items-center justify-center
                ${form.idBack ? 'border-green-500/50 bg-green-500/5' : 'border-noir-400 group-hover:border-gold/50 bg-noir-800/50'}`}>
                {form.idBack ? <img src={form.idBack} className="max-h-32 rounded-lg" alt="Back Preview" /> : <Upload className="text-ink-muted group-hover:text-gold mb-3" />}
                <p className="text-xs text-ink-muted mt-2">{form.idBack ? "Back Captured" : "Click to upload back"}</p>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e, 'idBack')} />
              </div>
            </label>
          </div>

          <div className="flex gap-4 pt-6">
             <button className="btn-ghost flex-1 py-4" onClick={() => setStep(1)}>Back</button>
             <button 
               className="btn-gold flex-[2] py-4 disabled:opacity-50" 
               disabled={!form.idFront || !form.idBack} 
               onClick={() => setStep(3)}
             >
               Continue to Selfie
             </button>
          </div>
        </div>
      )}

      {/* STEP 3: Face Verification */}
      {step === 3 && (
        <div className="space-y-6 text-center animate-slide-up">
          <h2 className="text-3xl font-display text-ink-primary">Live Verification</h2>
          <p className="text-ink-secondary">Position your face in the center of the frame.</p>
          
          <div className="relative aspect-square rounded-full border-8 border-noir-800 max-w-[300px] mx-auto overflow-hidden shadow-2xl bg-black">
             {form.selfieImage ? (
               <img src={form.selfieImage} className="w-full h-full object-cover" alt="Selfie" />
             ) : (
               <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
             )}
          </div>

          <div className="pt-8">
            {!stream && !form.selfieImage && (
              <button className="btn-gold w-full py-4 rounded-full flex items-center justify-center gap-3" onClick={startCamera}>
                <Camera size={20}/> Open Camera
              </button>
            )}
            
            {stream && (
              <button className="btn-gold w-full py-4 rounded-full" onClick={takeSelfie}>Capture Photo</button>
            )}

            {form.selfieImage && (
              <button className="text-gold flex items-center justify-center gap-2 mx-auto mt-4 hover:underline" onClick={startCamera}>
                <RefreshCcw size={16}/> Retake Selfie
              </button>
            )}
          </div>

          <div className="flex gap-4 mt-12 pt-12 border-t border-noir-400">
             <button className="btn-ghost flex-1 py-4" onClick={() => setStep(2)}>Back</button>
             <button 
                className="btn-gold flex-[2] py-4 disabled:opacity-50" 
                disabled={loading || !form.selfieImage}
                onClick={submitKYC}
             >
                {loading ? 'Submitting Data...' : 'Complete My Verification'}
             </button>
          </div>
        </div>
      )}
    </div>
  )
}