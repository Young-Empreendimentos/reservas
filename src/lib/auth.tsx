'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, mensagemErro, supabase, type Perfil } from './supabase';

type Estado = 'carregando' | 'deslogado' | 'pendente' | 'recusado' | 'aprovado' | 'erro';

type Auth = {
  estado: Estado;
  session: Session | null;
  perfil: Perfil | null;
  admin: boolean;
  erro: string;
  entrar: () => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [estado, setEstado] = useState<Estado>('carregando');
  const [erro, setErro] = useState('');

  const carregarPerfil = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setPerfil(null);
      setEstado('deslogado');
      return;
    }
    // Cria a solicitação de acesso (pendente) no primeiro login e devolve o perfil.
    const { data, error } = await db.rpc('reservas_meu_perfil');
    if (error) {
      setErro(mensagemErro(error));
      setEstado('erro');
      return;
    }
    const p = data as Perfil;
    setPerfil(p);
    setEstado(p.status === 'aprovado' ? 'aprovado' : p.status === 'recusado' ? 'recusado' : 'pendente');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => carregarPerfil(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') carregarPerfil(s);
      else setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil]);

  const entrar = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }, []);

  const sair = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await carregarPerfil(data.session);
  }, [carregarPerfil]);

  const admin = estado === 'aprovado' && perfil?.papel === 'admin';

  return (
    <Ctx.Provider value={{ estado, session, perfil, admin, erro, entrar, sair, recarregar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
