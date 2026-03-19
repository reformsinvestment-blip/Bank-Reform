import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom' // Added this
import { useAuth } from '../context/AuthContext'
import { usersAPI } from '../services/api'
import { FileText, Camera, CheckCircle, ShieldCheck, Upload, RefreshCcw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function KYC() {
  const { user, refreshUser, loading: authLoading } = useAuth() 
  const navigate = useNavigate() // Initialize navigate
  const [step, setStep] = useState(1) 
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(true) 
  
  const [form, setForm] = useState({
    fullName: '', docType: 'passport', docNumber: '', address: '',
    idFront: null, idBack: null, selfieImage: null
  })

  // ─── SYNC ON MOUNT ───
  useEffect(() => {
    const initSync = async () => {
      await refreshUser();
      setIsSyncing(false);
    };
    initSync();
  }, []);

  const videoRef = useRef(null)
  const [stream, setStream] = useState(null)

  // 1. Wait for server verification
  if (authLoading || isSyncing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCcw className="w-10 h-10 text-gold animate-spin" />
      </div>
    )
  }

  // 2. Status Check
  const isPending = 
    user?.status === 'pending_review' || 
    user?.kycStatus === 'pending_review' || 
    user?.status === 'pending';

  // 3. PENDING REVIEW SCREEN (Locks user on this screen or redirects)
  if (isPending || step === 4) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in px-4">
         <div className="bg-noir-700 border border-noir-400 p-8 md:p-12 rounded-[40px] text-center max-w-md shadow-2xl">
            <div className="relative mb-8">
              <CheckCircle size={80} className="text-gold mx-auto animate-pulse" />
              <div className="absolute inset-0 bg-gold/20 blur-3xl rounded-full" />
            </div>
            <h2 className="text-3xl font-display text-ink-primary mb-4">Under Review</h2>
            <p className="text-ink-secondary leading-relaxed mb-8">
              Documents received. Our team is currently reviewing your identity. This typically takes 1 to 12 hours.
            </p>
            <div className="bg-noir-800 p-4 rounded-2xl border border-noir-400 mb-8 text-left">
               <span className="text-[10px] uppercase tracking-widest text-ink-muted block mb-1">Status</span>
               <span className="text-gold font-medium flex items-center gap-2 uppercase tracking-tighter">
                 <RefreshCcw size={14} className="animate-spin" /> Verification In Progress
               </span>
            </div>
            <button className="btn-gold w-full py-4 font-bold rounded-xl" onClick={() => window.location.reload()}>REFRESH STATUS</button>
         </div>
      </div>
    )
  }

  // --- Handlers ---
  const handleFile = (e, side) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setForm(prev => ({ ...prev, [side]: reader.result }))
      reader.readAsDataURL(file)
    }
  }

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) videoRef.current.srcObject = s
      setStream(s)
    } catch (err) { toast.error("Camera access denied") }
  }

  const takeSelfie = () => {
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    setForm(prev => ({ ...prev, selfieImage: canvas.toDataURL('image/jpeg') }))
    if (stream) stream.getTracks().forEach(t => t.stop())
    setStream(null)
    toast.success("Selfie captured!")
  }

  const submitKYC = async () => {
    if (!form.idFront || !form.idBack || !form.selfieImage) {
        return toast.error("Please complete all upload steps")
    }
    setLoading(true)
    try {
      await usersAPI.submitKYC(form)
    toast.success("Submitted successfully!")
    await refreshUser() // Update local context
    navigate('/kyc-pending')
    } catch (err) { 
      toast.error(err.response?.data?.message || "Submission failed") 
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <div className="flex justify-between mb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className={`h-1.5 w-full rounded-full mx-1 transition-all duration-500 ${step >= i ? 'bg-gold' : 'bg-noir-400'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-slide-up">
          <h1 className="text-4xl font-display text-ink-primary">Identity Details</h1>
          <div className="space-y-5 pt-4">
            <label className="field-label">Full Legal Name</label>
            <input className="field-input" placeholder='John Victor' value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} />
            <label className="field-label">Document Type</label>
            <select className="field-select" value={form.docType} onChange={e => setForm({...form, docType: e.target.value})}>
                <option value="passport">International Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="id_card">ID Card</option>
            </select>
            <label className="field-label" >ID Number</label>
            <input className="field-input" placeholder='A1234567' value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} />
            <label className="field-label">Residential Address</label>
            <textarea className="field-input h-28" placeholder='123 Main Street, City, Country' value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          </div>
          <button className="btn-gold w-full py-4 mt-6" disabled={!form.fullName || !form.docNumber} onClick={() => setStep(2)}>Continue</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8 animate-slide-up">
          <h2 className="text-3xl font-display text-ink-primary">Document Upload</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="cursor-pointer">
              <div className={`border-2 border-dashed rounded-3xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center ${form.idFront ? 'border-green-500 bg-green-500/5' : 'border-noir-400 bg-noir-800/50'}`}>
                {form.idFront ? <CheckCircle className="mx-auto text-green-500" /> : <Upload className="mx-auto" />}
                <p className="text-xs mt-2 font-medium uppercase tracking-tighter">{form.idFront ? "Front Ready" : "Upload Front"}</p>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e, 'idFront')} />
              </div>
            </label>
            <label className="cursor-pointer">
              <div className={`border-2 border-dashed rounded-3xl p-8 text-center min-h-[200px] flex flex-col items-center justify-center ${form.idBack ? 'border-green-500 bg-green-500/5' : 'border-noir-400 bg-noir-800/50'}`}>
                {form.idBack ? <CheckCircle className="mx-auto text-green-500" /> : <Upload className="mx-auto" />}
                <p className="text-xs mt-2 font-medium uppercase tracking-tighter">{form.idBack ? "Back Ready" : "Upload Back"}</p>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e, 'idBack')} />
              </div>
            </label>
          </div>
          <button className="btn-gold w-full py-4" disabled={!form.idFront || !form.idBack} onClick={() => setStep(3)}>Continue to Selfie</button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 text-center animate-slide-up">
          <h2 className="text-3xl font-display text-ink-primary">Live Verification</h2>
          <div className="relative aspect-square rounded-full border-8 border-noir-800 max-w-[280px] mx-auto overflow-hidden bg-black shadow-2xl">
             {form.selfieImage ? <img src={form.selfieImage} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
          </div>
          <div className="pt-4 flex flex-col gap-3">
            {!stream && !form.selfieImage ? (
              <button className="btn-gold w-full py-4" onClick={startCamera}>OPEN CAMERA</button>
            ) : stream ? (
              <button className="btn-gold w-full py-4" onClick={takeSelfie}>CAPTURE PHOTO</button>
            ) : (
              <button className="btn-ghost w-full py-4 text-gold border border-gold/20 rounded-xl" onClick={() => setForm(p => ({...p, selfieImage: null}))}>RETAKE PHOTO</button>
            )}
          </div>
          <button className="btn-gold w-full py-4 mt-6 font-bold" disabled={loading || !form.selfieImage} onClick={submitKYC}>
            {loading ? 'SUBMITTING...' : 'COMPLETE VERIFICATION'}
          </button>
        </div>
      )}
    </div>
  )
}