'use client';

import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID_RESERVAS, supabase } from '@/src/lib/supabase';

// Login independente do app "Login Young" (que é Interno e bloqueia Gmail):
// Google Identity Services com o cliente OAuth próprio do Reservas (projeto Cloud separado, Externo)
// → signInWithIdToken no Supabase. O Client ID precisa constar na lista "Client IDs" do provedor Google.
type Gis = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

async function sha256(texto: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function carregarGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google ? ok(w.google) : falha(new Error('Google indisponível')));
    s.onerror = () => falha(new Error('Não foi possível carregar o login do Google'));
    document.head.appendChild(s);
  });
}

export default function BotaoGoogle() {
  const ref = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const google = await carregarGis();
        const nonce = crypto.randomUUID();
        const nonceHash = await sha256(nonce);
        if (!ativo || !ref.current) return;
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID_RESERVAS,
          nonce: nonceHash,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }: { credential: string }) => {
            setErro('');
            const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
            if (error) setErro(error.message);
          },
        });
        google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'pt-BR' });
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { ativo = false; };
  }, []);

  return (
    <div>
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }} />
      {erro && <p className="form-error">{erro}</p>}
    </div>
  );
}
