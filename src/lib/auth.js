import { supabase } from './supabase.js'

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile() {
  const session = await getSession()
  if (!session) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInWithMagicLink(email) {
  const { data, error } = await supabase.auth.signInWithOtp({ email })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

export async function authGuard(initApp, container, platformName) {
  const session = await getSession()
  if (session) {
    initApp(session)
    return
  }
  renderLoginScreen(container, platformName, initApp)

  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      initApp(session)
    }
  })
}

function renderLoginScreen(container, platformName, initApp) {
  container.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F5F5F4;font-family:'Inter',sans-serif;">
      <div style="width:380px;background:#FFF;border-radius:16px;padding:40px;box-shadow:0 2px 20px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.06);">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:22px;font-weight:800;color:#161F45;">PPM</span>
            <span style="font-size:16px;font-weight:300;color:#CCB79E;">${platformName}</span>
          </div>
          <div style="font-size:12px;color:rgba(0,0,0,0.4);">Log in om verder te gaan</div>
        </div>
        <div id="ppm-login-form">
          <div id="ppm-login-error" style="display:none;background:rgba(255,59,48,0.08);color:#FF3B30;padding:8px 12px;border-radius:8px;font-size:11px;margin-bottom:12px;"></div>
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;font-weight:500;color:rgba(0,0,0,0.5);display:block;margin-bottom:4px;">Email</label>
            <input type="email" id="ppm-login-email" placeholder="naam@bedrijf.nl" style="width:100%;padding:10px 12px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.15s;" onfocus="this.style.borderColor='#161F45'" onblur="this.style.borderColor='rgba(0,0,0,0.12)'" />
          </div>
          <div style="margin-bottom:16px;">
            <label style="font-size:11px;font-weight:500;color:rgba(0,0,0,0.5);display:block;margin-bottom:4px;">Wachtwoord</label>
            <input type="password" id="ppm-login-password" placeholder="Wachtwoord" style="width:100%;padding:10px 12px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;outline:none;box-sizing:border-box;transition:border-color 0.15s;" onfocus="this.style.borderColor='#161F45'" onblur="this.style.borderColor='rgba(0,0,0,0.12)'" />
          </div>
          <button id="ppm-login-btn" style="width:100%;padding:11px;border:none;border-radius:8px;background:#161F45;color:#FFF;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;cursor:pointer;transition:opacity 0.15s;">Inloggen</button>
          <div style="text-align:center;margin-top:12px;">
            <button id="ppm-magic-link-btn" style="background:none;border:none;color:#CCB79E;font-size:11px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;">Of log in met magic link</button>
          </div>
          <div id="ppm-magic-link-sent" style="display:none;text-align:center;margin-top:12px;font-size:11px;color:#34C759;">Check je inbox voor de login link!</div>
        </div>
      </div>
    </div>
  `

  const emailInput = document.getElementById('ppm-login-email')
  const passwordInput = document.getElementById('ppm-login-password')
  const loginBtn = document.getElementById('ppm-login-btn')
  const magicBtn = document.getElementById('ppm-magic-link-btn')
  const errorDiv = document.getElementById('ppm-login-error')

  loginBtn.addEventListener('click', async () => {
    errorDiv.style.display = 'none'
    loginBtn.textContent = 'Laden...'
    loginBtn.disabled = true
    try {
      await signIn(emailInput.value, passwordInput.value)
    } catch (err) {
      errorDiv.textContent = err.message === 'Invalid login credentials'
        ? 'Onjuist email of wachtwoord'
        : err.message
      errorDiv.style.display = 'block'
      loginBtn.textContent = 'Inloggen'
      loginBtn.disabled = false
    }
  })

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click()
  })

  magicBtn.addEventListener('click', async () => {
    if (!emailInput.value) {
      errorDiv.textContent = 'Vul eerst je email in'
      errorDiv.style.display = 'block'
      return
    }
    try {
      await signInWithMagicLink(emailInput.value)
      document.getElementById('ppm-magic-link-sent').style.display = 'block'
      magicBtn.style.display = 'none'
    } catch (err) {
      errorDiv.textContent = err.message
      errorDiv.style.display = 'block'
    }
  })
}
