import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Check, X, Eye, User, FileText, Camera, ShieldCheck } from 'lucide-react';

export default function AdminReview() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState(null); // For the Image Modal
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => { loadPending(); }, []);

  const loadPending = async () => {
    try {
      const res = await adminAPI.getPendingKYC();
      // res.data.users (matches our updated backend response)
      setPendingUsers(res.data.users || []);
    } catch (err) { 
      toast.error("Failed to load pending list"); 
    } finally { 
      setLoading(false); 
    }
  };

  // ─── VIEW DOCUMENTS LOGIC ───
  const handleViewDocs = async (userId) => {
    setViewLoading(true);
    try {
      const res = await adminAPI.getKYCDocuments(userId);
      setSelectedDocs(res.data.data); // This contains idFront, idBack, selfieImage, fullName, etc.
    } catch (err) {
      toast.error("User has not uploaded documents yet.");
    } finally {
      setViewLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm("Approve user? This will create their bank account and send an email.")) return;
    try {
      await adminAPI.approveKYC(id);
      toast.success("User Approved! Account is now active.");
      setSelectedDocs(null); // Close modal if open
      loadPending(); // Refresh list
    } catch (err) { 
      toast.error("Approval failed: " + (err.response?.data?.message || "Error")); 
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Enter reason for rejection (this will be emailed to the user):");
    if (!reason) return;
    try {
      await adminAPI.rejectKYC(id, reason);
      toast.success("User rejected and notified.");
      setSelectedDocs(null); // Close modal if open
      loadPending();
    } catch (err) { 
      toast.error("Rejection failed"); 
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-t-gold border-noir-400 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display text-ink-primary">KYC Approvals</h1>
        <p className="text-ink-muted text-sm mt-1">Review identity documents and activate user accounts</p>
      </div>
      
      <div className="bg-noir-700 border border-noir-400 rounded-[32px] overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead className="bg-noir-800/50 text-ink-muted text-[10px] uppercase tracking-[0.2em]">
            <tr>
              <th className="p-6">Applicant</th>
              <th className="p-6">Status</th>
              <th className="p-6">Submission Date</th>
              <th className="p-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-noir-400">
            {pendingUsers.length === 0 && (
              <tr><td colSpan="4" className="p-20 text-center text-ink-muted italic">No pending verifications at this time</td></tr>
            )}
            {pendingUsers.map(u => (
              <tr key={u.id} className="group hover:bg-noir-600/20 transition-colors">
                <td className="p-6">
                  <div className="text-ink-primary font-medium">{u.firstName} {u.lastName}</div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </td>
                <td className="p-6">
                  <span className="bg-gold/10 text-gold text-[10px] font-bold px-2 py-1 rounded uppercase tracking-tighter">
                    Pending Review
                  </span>
                </td>
                <td className="p-6 text-ink-muted text-sm">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="p-6">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => handleViewDocs(u.id)}
                      className="p-2.5 bg-noir-600 text-ink-primary rounded-xl hover:bg-gold hover:text-noir-900 transition-all shadow-lg"
                      title="View ID Documents"
                    >
                      <Eye size={18}/>
                    </button>
                    <button 
                      onClick={() => handleApprove(u.id)}
                      className="p-2.5 bg-green-600/10 text-green-500 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-lg"
                      title="Approve Applicant"
                    >
                      <Check size={18}/>
                    </button>
                    <button 
                      onClick={() => handleReject(u.id)}
                      className="p-2.5 bg-crimson/10 text-crimson rounded-xl hover:bg-crimson hover:text-white transition-all shadow-lg"
                      title="Reject Applicant"
                    >
                      <X size={18}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── DOCUMENT INSPECTION MODAL ─── */}
      {selectedDocs && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 md:p-10 animate-fade-in">
          <div className="bg-noir-800 border border-noir-400 rounded-[40px] max-w-5xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-noir-800 p-8 border-b border-noir-400 flex justify-between items-center z-10">
              <div>
                <h2 className="text-2xl text-white font-display">Identity Verification</h2>
                <p className="text-gold text-sm font-medium">Applicant: {selectedDocs.fullName}</p>
              </div>
              <button 
                onClick={() => setSelectedDocs(null)}
                className="p-2 bg-noir-600 rounded-full text-ink-muted hover:text-white transition-colors"
              >
                <X size={24}/>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* ID Front */}
                <div className="space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-ink-muted text-xs uppercase tracking-widest">
                    <FileText size={14}/> ID Front Side
                  </div>
                  <div className="bg-noir-900 rounded-3xl border border-noir-400 overflow-hidden shadow-inner p-2">
                    <img src={selectedDocs.idFront} className="w-full object-contain max-h-[300px] rounded-2xl" alt="ID Front" />
                  </div>
                </div>

                {/* ID Back */}
                <div className="space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-ink-muted text-xs uppercase tracking-widest">
                    <FileText size={14}/> ID Back Side
                  </div>
                  <div className="bg-noir-900 rounded-3xl border border-noir-400 overflow-hidden shadow-inner p-2">
                    <img src={selectedDocs.idBack} className="w-full object-contain max-h-[300px] rounded-2xl" alt="ID Back" />
                  </div>
                </div>

                {/* Selfie */}
                <div className="space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-ink-muted text-xs uppercase tracking-widest">
                    <Camera size={14}/> Live Selfie
                  </div>
                  <div className="bg-noir-900 rounded-3xl border border-noir-400 overflow-hidden shadow-inner p-2">
                    <img src={selectedDocs.selfieImage} className="w-full object-contain max-h-[300px] rounded-2xl" alt="Selfie" />
                  </div>
                </div>

              </div>

              {/* Document Info Card */}
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-noir-700/50 p-5 rounded-2xl border border-noir-400">
                    <p className="text-[10px] text-ink-muted uppercase mb-1">Document Number</p>
                    <p className="text-white font-mono">{selectedDocs.documentNumber}</p>
                 </div>
                 <div className="bg-noir-700/50 p-5 rounded-2xl border border-noir-400">
                    <p className="text-[10px] text-ink-muted uppercase mb-1">Document Type</p>
                    <p className="text-white capitalize">{selectedDocs.documentType}</p>
                 </div>
              </div>
            </div>

            {/* Modal Footer (Quick Actions) */}
            <div className="p-8 border-t border-noir-400 bg-noir-800/50 flex gap-4">
               <button 
                 onClick={() => handleApprove(selectedDocs.userId)}
                 className="flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-green-900/20"
               >
                 Approve & Create Account
               </button>
               <button 
                 onClick={() => handleReject(selectedDocs.userId)}
                 className="flex-1 bg-noir-600 hover:bg-crimson text-white py-4 rounded-2xl font-bold transition-all border border-noir-400"
               >
                 Reject Documents
               </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}