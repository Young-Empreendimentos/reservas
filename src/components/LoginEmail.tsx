'use client';

import { useState } from 'react';
import { supabase } from '@/src/lib/supabase';

// Login por e-mail e senha (Supabase Auth), sem Google: corretores externos usam qualquer e-mail.
// Quem já entrava com Google cria a senha em "Esqueci minha senha", com o mesmo e-mail.
type Modo = 'entrar' | 'criar' | 'esqueci';

const voltaPara = () => window.location.origin + window.location.pathname;

function traduzir(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered/i.test(msg)) return 'Este e-mail já tem cadastro. Use "Esqueci minha senha" para definir uma senha.';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit|security purposes/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  return msg;
}

export default function LoginEmail() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);

  function trocar(m: Modo) { setModo(m); setErro(''); setOk(''); }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setOk('');
    const em = email.trim().toLowerCase();
    if (modo === 'criar' && senha !== senha2) { setErro('As senhas não conferem.'); return; }
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: senha });
        if (error) throw error;
      } else if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email: em, password: senha,
          options: { data: { full_name: nome.trim() }, emailRedirectTo: voltaPara() },
        });
        if (error) throw error;
        // E-mail já cadastrado: o Supabase devolve usuário sem identidades em vez de erro.
        if (data.user && !data.user.identities?.length) throw new Error('already registered');
        if (!data.session) setOk(`Enviamos um link de confirmação para ${em}. Abra o e-mail e clique no link para ativar o acesso.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: voltaPara() });
        if (error) throw error;
        setOk(`Se ${em} tiver cadastro, enviamos um link para definir a senha.`);
      }
    } catch (e) {
      setErro(traduzir(e instanceof Error ? e.message : String(e)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 12, marginTop: 8 }}>
      {modo === 'criar' && (
        <label className="field full">
          <span className="field-label">Nome completo</span>
          <input required value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" />
        </label>
      )}
      <label className="field full">
        <span className="field-label">E-mail</span>
        <input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {modo !== 'esqueci' && (
        <label className="field full">
          <span className="field-label">{modo === 'criar' ? 'Crie uma senha (mín. 6 caracteres)' : 'Senha'}</span>
          <input required type="password" minLength={6} value={senha} onChange={e => setSenha(e.target.value)}
            autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />
        </label>
      )}
      {modo === 'criar' && (
        <label className="field full">
          <span className="field-label">Repita a senha</span>
          <input required type="password" minLength={6} value={senha2} onChange={e => setSenha2(e.target.value)} autoComplete="new-password" />
        </label>
      )}

      {erro && <div className="form-error">{erro}</div>}
      {ok && <div className="notice">{ok}</div>}

      <button className="primary-button" disabled={enviando}>
        {enviando ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {modo !== 'entrar' && <button type="button" className="link" onClick={() => trocar('entrar')}>Já tenho conta</button>}
        {modo !== 'criar' && <button type="button" className="link" onClick={() => trocar('criar')}>Criar conta</button>}
        {modo !== 'esqueci' && <button type="button" className="link" onClick={() => trocar('esqueci')}>Esqueci minha senha</button>}
      </div>
    </form>
  );
}

// Tela aberta pelo link de "Esqueci minha senha" (evento PASSWORD_RECOVERY).
export function NovaSenha({ onPronto }: { onPronto: () => void }) {
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha !== senha2) { setErro('As senhas não conferem.'); return; }
    setEnviando(true); setErro('');
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) setErro(traduzir(error.message)); else onPronto();
  }

  return (
    <form onSubmit={salvar} style={{ display: 'grid', gap: 12, marginTop: 8 }}>
      <label className="field full">
        <span className="field-label">Nova senha (mín. 6 caracteres)</span>
        <input required type="password" minLength={6} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="field full">
        <span className="field-label">Repita a nova senha</span>
        <input required type="password" minLength={6} value={senha2} onChange={e => setSenha2(e.target.value)} autoComplete="new-password" />
      </label>
      {erro && <div className="form-error">{erro}</div>}
      <button className="primary-button" disabled={enviando}>{enviando ? 'Salvando...' : 'Salvar senha'}</button>
    </form>
  );
}
