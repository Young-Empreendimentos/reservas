'use client';

import { useEffect, useState } from 'react';
import MapaLoteamento from '@/src/components/MapaLoteamento';
import ReservasPainel from '@/src/components/ReservasPainel';
import UsuariosPainel from '@/src/components/UsuariosPainel';
import { AuthProvider, useAuth } from '@/src/lib/auth';

type Aba = 'mapa' | 'reservas' | 'usuarios';

export default function Home() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

function App() {
  const { estado, perfil, admin, erro, entrar, sair, recarregar } = useAuth();
  const [aba, setAba] = useState<Aba>('mapa');

  useEffect(() => {
    const h = window.location.hash.replace('#', '') as Aba;
    if (h === 'reservas' || h === 'usuarios' || h === 'mapa') setAba(h);
  }, []);

  function trocar(a: Aba) {
    setAba(a);
    window.history.replaceState(null, '', `#${a}`);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img className="brand-logo" src="logo-erico-verissimo.png" alt="Bairro Erico Verissimo - Fase 2" />
        </div>
        {estado === 'aprovado' ? (
          <nav className="tabs">
            <button className={aba === 'mapa' ? 'ativo' : ''} onClick={() => trocar('mapa')}>Mapa</button>
            <button className={aba === 'reservas' ? 'ativo' : ''} onClick={() => trocar('reservas')}>
              {admin ? 'Reservas' : 'Minhas reservas'}
            </button>
            {admin && (
              <button className={aba === 'usuarios' ? 'ativo' : ''} onClick={() => trocar('usuarios')}>Usuários</button>
            )}
          </nav>
        ) : (
          <div className="header-title">Reservas</div>
        )}
        {perfil && (
          <div className="usuario">
            <span>{perfil.nome || perfil.email}</span>
            <button className="link" onClick={sair}>Sair</button>
          </div>
        )}
      </header>

      {estado === 'carregando' && <Aviso titulo="Carregando..." />}

      {estado === 'deslogado' && (
        <Aviso titulo="Reservas — Bairro Erico Verissimo · Fase 2">
          <p>Entre com sua conta Google para acessar o mapa e as reservas.</p>
          <button className="primary-button compacto" onClick={entrar}>Entrar com Google</button>
        </Aviso>
      )}

      {estado === 'pendente' && (
        <Aviso titulo="Acesso aguardando liberação">
          <p>
            Recebemos seu pedido de acesso ({perfil?.email}). Um administrador da Young precisa liberar
            seu usuário. Depois disso, é só recarregar a página.
          </p>
          <button className="secondary-button" onClick={recarregar}>Verificar novamente</button>
        </Aviso>
      )}

      {estado === 'recusado' && (
        <Aviso titulo="Acesso não liberado">
          <p>Seu acesso ({perfil?.email}) não foi liberado. Fale com a equipe da Young.</p>
        </Aviso>
      )}

      {estado === 'erro' && (
        <Aviso titulo="Não foi possível carregar seu acesso">
          <p>{erro}</p>
          <button className="secondary-button" onClick={recarregar}>Tentar novamente</button>
        </Aviso>
      )}

      {estado === 'aprovado' && aba === 'mapa' && <MapaLoteamento />}
      {estado === 'aprovado' && aba === 'reservas' && <ReservasPainel />}
      {estado === 'aprovado' && aba === 'usuarios' && admin && <UsuariosPainel />}
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <main className="aviso-page">
      <section className="aviso-card">
        <h1>{titulo}</h1>
        {children}
      </section>
    </main>
  );
}
