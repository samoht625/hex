import { Header } from './components/Header'
import { HowToPlay } from './components/HowToPlay'
import { GameMenuProvider } from './components/Menu'
import { Toast } from './components/Toast'
import { LocalGame } from './modes/LocalGame'
import { OnlineGame } from './modes/OnlineGame'
import { navigate, useRoute, type Mode } from './lib/router'

export function App() {
  const route = useRoute()

  const switchMode = (mode: Mode) => {
    if (mode === route.mode) return
    navigate(mode === 'online' ? { mode, code: null } : { mode })
  }

  return (
    <GameMenuProvider>
      <div className="flex h-dvh flex-col overflow-hidden pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        <Header mode={route.mode} onSwitchMode={switchMode} />
        {route.mode === 'local' && <LocalGame key="local" vsComputer={false} />}
        {route.mode === 'computer' && <LocalGame key="computer" vsComputer />}
        {route.mode === 'online' && <OnlineGame code={route.code} />}
      </div>
      <HowToPlay />
      <Toast />
    </GameMenuProvider>
  )
}
