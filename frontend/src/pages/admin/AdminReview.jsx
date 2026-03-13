import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Check, X, Eye } from 'lucide-react';

export default function AdminReview() {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPending(); }, []);

  const loadPending = async () => {
    try {
      const res = await adminAPI.getPendingKYC();
      setPendingUsers(res.data.users);
    } catch (err) { toast.error("Failed to load list"); }
    finally { setLoading(false); }
  };

  const handleApprove = async (id) => {
    if (!window.confirm("Approve user and auto-create bank account?")) return;
    try {
      await adminAPI.approveKYC(id);
      toast.success("User Approved! Account created.");
      loadPending();
    } catch (err) { toast.error("Approval failed"); }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Enter reason for rejection:");
    if (!reason) return;
    try {
      await adminAPI.rejectKYC(id, reason);
      toast.success("User rejected and notified.");
      loadPending();
    } catch (err) { toast.error("Rejection failed"); }
  };

  if (loading) return <div className="p-10 text-center">Loading pending requests...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-display text-ink-primary mb-8">Pending Verifications</h1>
      
      <div className="bg-noir-700 border border-noir-400 rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-noir-800 text-ink-muted text-xs uppercase tracking-widest">
            <tr>
              <th className="p-5">Name</th>
              <th className="p-5">Email</th>
              <th className="p-5">Date Joined</th>
              <th className="p-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-noir-400">
            {pendingUsers.length === 0 && (
              <tr><td colSpan="4" className="p-10 text-center text-ink-muted">No pending KYC requests</td></tr>
            )}
            {pendingUsers.map(u => (
              <tr key={u.id} className="hover:bg-noir-600/30 transition-colors">
                <td className="p-5 text-ink-primary font-medium">{u.firstName} {u.lastName}</td>
                <td className="p-5 text-ink-secondary">{u.email}</td>
                <td className="p-5 text-ink-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="p-5 flex justify-end gap-3">
                  <button className="p-2 text-gold hover:bg-gold/10 rounded-lg" title="View Details"><Eye size={18}/></button>
                  <button onClick={() => handleApprove(u.id)} className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg" title="Approve"><Check size={18}/></button>
                  <button onClick={() => handleReject(u.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Reject"><X size={18}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}