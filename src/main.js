import { authGuard } from './lib/auth.js'
import { initApp } from './app.js'

authGuard(initApp, document.getElementById('app'), 'Ideeën')
