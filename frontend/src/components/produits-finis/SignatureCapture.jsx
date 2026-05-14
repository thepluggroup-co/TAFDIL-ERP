import { useRef, useEffect, useState } from 'react';
import SignaturePad from 'signature_pad';
import { produitsFiniApi } from '@/api/produitsFinis';
import { RotateCcw, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Capture de signature électronique pour bon de livraison.
 * Utilisé sur la page publique /signature/:token
 */
export default function SignatureCapture({ token, blNumero, onSigned }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    padRef.current = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: '#1a3a5c',
    });
    const resize = () => {
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      padRef.current.clear();
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handleConfirm = async () => {
    if (padRef.current.isEmpty()) return toast.error('Veuillez signer avant de confirmer');
    setSubmitting(true);
    try {
      const dataUrl = padRef.current.toDataURL('image/png');
      await produitsFiniApi.signerBL(token, dataUrl);
      setSigned(true);
      toast.success('Livraison confirmée par votre signature');
      onSigned?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (signed) return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <CheckCircle size={56} className="text-green-500" />
      <p className="text-xl font-bold text-gray-800">Livraison confirmée</p>
      <p className="text-gray-500 text-sm">Votre signature a été enregistrée pour le BL {blNumero}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        En signant ci-dessous, vous confirmez avoir reçu la commande en bon état — BL {blNumero}
      </p>
      <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef} className="w-full h-40 touch-none cursor-crosshair" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => padRef.current?.clear()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border rounded-lg">
          <RotateCcw size={13} /> Effacer
        </button>
        <button onClick={handleConfirm} disabled={submitting}
          className="flex-1 py-2 bg-[#1a3a5c] hover:bg-[#0f2540] disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors">
          {submitting ? 'Enregistrement…' : 'Confirmer la réception'}
        </button>
      </div>
    </div>
  );
}
