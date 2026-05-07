/* ═══════════════════════════════════════════
   BloodLink TN — auth.js v6
   Fixes:
   ✅ Pending page shows real email/role/org
   ✅ Clears old session before new login
   ✅ Fetches full profile from /me
   ✅ Forgot password feature
   ✅ Hospital uses patient dashboard
═══════════════════════════════════════════ */

/* ─── 1. TAB SWITCHING ─────────────────── */
function showTab(tab) {
  const fL = document.getElementById('formLogin');
  const fR = document.getElementById('formRegister');
  const tL = document.getElementById('tabLogin');
  const tR = document.getElementById('tabRegister');
  if (tab === 'login') {
    fL.style.display = 'block'; fR.style.display = 'none';
    tL.classList.add('active'); tR.classList.remove('active');
  } else {
    fL.style.display = 'none'; fR.style.display = 'block';
    tL.classList.remove('active'); tR.classList.add('active');
  }
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('tab') === 'login') showTab('login');

const roleParam = urlParams.get('role');
if (roleParam) {
  showTab('register');
  const ri = document.querySelector('input[name="role"][value="' + roleParam + '"]');
  if (ri) { ri.checked = true; handleRoleChange(roleParam); }
}

/* ─── 2. ROLE SELECTION ────────────────── */
function handleRoleChange(role) {
  const orgGroup     = document.getElementById('orgNameGroup');
  const licenseGroup = document.getElementById('licenseGroup');
  const needsOrg     = role === 'bloodbank' || role === 'hospital';
  if (orgGroup)     orgGroup.style.display     = needsOrg ? 'block' : 'none';
  if (licenseGroup) licenseGroup.style.display = needsOrg ? 'block' : 'none';
  if (needsOrg) {
    const orgInput = document.getElementById('regOrgName');
    const licInput = document.getElementById('regLicense');
    if (orgInput) orgInput.placeholder = role === 'bloodbank' ? 'Salem Government Blood Bank' : 'Apollo Hospitals Salem';
    if (licInput) licInput.placeholder = role === 'bloodbank' ? 'e.g. TN/BB/2024/045' : 'e.g. TN/HOS/2024/112';
  }
}

document.querySelectorAll('input[name="role"]').forEach(function(r) {
  r.addEventListener('change', function() { handleRoleChange(r.value); });
});

/* ─── 3. PASSWORD SHOW/HIDE ─────────────── */
function togglePassword(id, btn) {
  var inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

/* ─── 4. PASSWORD STRENGTH ──────────────── */
var regPw = document.getElementById('regPassword');
if (regPw) {
  regPw.addEventListener('input', function() {
    var v = regPw.value;
    var meter = document.getElementById('pwStrength');
    var fill  = document.getElementById('strengthFill');
    var label = document.getElementById('strengthLabel');
    if (!v) { if (meter) meter.style.display = 'none'; return; }
    if (meter) meter.style.display = 'flex';
    var score = 0;
    if (v.length >= 8)           score++;
    if (/[A-Z]/.test(v))         score++;
    if (/[0-9]/.test(v))         score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    var lvls = [
      { w:'25%',  c:'#EF4444', t:'Weak'   },
      { w:'50%',  c:'#F97316', t:'Fair'   },
      { w:'75%',  c:'#EAB308', t:'Good'   },
      { w:'100%', c:'#22C55E', t:'Strong' },
    ];
    var l = lvls[score - 1] || lvls[0];
    if (fill)  { fill.style.width = l.w; fill.style.background = l.c; }
    if (label) { label.textContent = l.t; label.style.color = l.c; }
  });
}

/* ─── 5. VALIDATION ─────────────────────── */
function showError(fId, eId, msg) {
  var f = document.getElementById(fId); var e = document.getElementById(eId);
  if (f) f.classList.add('error');
  if (e) e.textContent = msg;
  return false;
}
function clearError(fId, eId) {
  var f = document.getElementById(fId); var e = document.getElementById(eId);
  if (f) f.classList.remove('error');
  if (e) e.textContent = '';
}
function clearAll(ids) { ids.forEach(function(pair) { clearError(pair[0], pair[1]); }); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isPhone(v) { return /^\d{10}$/.test(v.replace(/\s/g, '')); }

/* ─── CLEAR OLD SESSION ─────────────────── */
function clearPreviousSession() {
  localStorage.removeItem('bl_token');
  localStorage.removeItem('bl_user');
  // Keep bl_pending so pending page still works if user refreshes
}

/* ─── 6a. LOGIN ──────────────────────────── */
var loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAll([['loginEmail','loginEmailErr'],['loginPassword','loginPasswordErr']]);

    var email = document.getElementById('loginEmail').value.trim();
    var pw    = document.getElementById('loginPassword').value;
    var ok    = true;

    if (!email)           ok = showError('loginEmail','loginEmailErr','Email is required');
    else if (!isEmail(email)) ok = showError('loginEmail','loginEmailErr','Enter a valid email address');
    if (!pw)              ok = showError('loginPassword','loginPasswordErr','Password is required');
    else if (pw.length<6) ok = showError('loginPassword','loginPasswordErr','Minimum 6 characters');
    if (!ok) return;

    setLoading('loginBtn', true);
    try {
      clearPreviousSession();
      var data = await api.auth.login(email, pw);
      var user = data.user;

      // Fetch full profile to ensure all fields present
      try {
        var meData = await api.auth.me();
        if (meData && meData.user) {
          user = meData.user;
          localStorage.setItem('bl_user', JSON.stringify(user));
        }
      } catch(me) { /* use login data */ }

      // Pending redirect for unverified banks/hospitals
      if ((user.role === 'bloodbank' || user.role === 'hospital') && !user.isVerified) {
        // ★ Store credentials for pending page
        localStorage.setItem('bl_pending', JSON.stringify({
          email:    user.email,
          orgName:  user.orgName || (user.firstName + ' ' + (user.lastName||'')).trim(),
          role:     user.role,
          district: user.district,
          licenseNumber: user.licenseNumber || '',
          autoApproveAt: user.autoApproveAt,
        }));
        window.location.href = '../pages/pending-approval.html';
      } else {
        window.location.href = getDashboardUrl(user.role);
      }
    } catch(err) {
      showFormAlert('loginAlert', 'error', err.message);
      setLoading('loginBtn', false);
    }
  });
}

/* ─── 6b. REGISTER ───────────────────────── */
var registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAll([
      ['regFirstName','regFirstNameErr'],['regLastName','regLastNameErr'],
      ['regOrgName','regOrgNameErr'],['regLicense','regLicenseErr'],
      ['regEmail','regEmailErr'],['regPhone','regPhoneErr'],
      ['regDistrict','regDistrictErr'],['regPassword','regPasswordErr'],
    ]);

    var role      = document.querySelector('input[name="role"]:checked').value;
    var firstName = document.getElementById('regFirstName').value.trim();
    var lastName  = document.getElementById('regLastName').value.trim();
    var orgName   = document.getElementById('regOrgName').value.trim();
    var license   = document.getElementById('regLicense') ? document.getElementById('regLicense').value.trim() : '';
    var email     = document.getElementById('regEmail').value.trim();
    var phone     = document.getElementById('regPhone').value.trim();
    var district  = document.getElementById('regDistrict').value;
    var password  = document.getElementById('regPassword').value;
    var terms     = document.getElementById('regTerms').checked;
    var needsOrg  = role === 'bloodbank' || role === 'hospital';
    var ok        = true;

    if (!firstName)  ok = showError('regFirstName','regFirstNameErr','First name is required');
    if (!lastName)   ok = showError('regLastName','regLastNameErr','Last name is required');
    if (needsOrg && !orgName)  ok = showError('regOrgName','regOrgNameErr','Organisation name is required');
    if (needsOrg && !license)  ok = showError('regLicense','regLicenseErr','Government license number is required');
    else if (needsOrg && license.length < 4) ok = showError('regLicense','regLicenseErr','Enter a valid license number (min 4 chars)');
    if (!email)          ok = showError('regEmail','regEmailErr','Email is required');
    else if (!isEmail(email)) ok = showError('regEmail','regEmailErr','Enter a valid email address');
    if (!phone)          ok = showError('regPhone','regPhoneErr','Phone number is required');
    else if (!isPhone(phone)) ok = showError('regPhone','regPhoneErr','Enter a valid 10-digit number');
    if (!district)  ok = showError('regDistrict','regDistrictErr','Please select your district');
    if (!password)  ok = showError('regPassword','regPasswordErr','Password is required');
    else if (password.length < 8) ok = showError('regPassword','regPasswordErr','Minimum 8 characters');
    if (!terms) {
      var te = document.getElementById('regTermsErr');
      if (te) te.textContent = 'You must accept the terms to register';
      ok = false;
    }
    if (!ok) return;

    setLoading('registerBtn', true);

    try {
      clearPreviousSession();

      var data = await api.auth.register({
        firstName, lastName, orgName,
        licenseNumber: license,
        email, phone, district, password, role,
      });
      var user = data.user;

      // ★ Store bl_pending IMMEDIATELY with email+password hint+org
      // so pending page can display it even if /me fails
      if (needsOrg) {
        localStorage.setItem('bl_pending', JSON.stringify({
          email:    email,
          orgName:  orgName || (firstName + ' ' + lastName),
          role:     role,
          district: district,
          licenseNumber: license,
          autoApproveAt: user.autoApproveAt,
          passwordHint:  password.slice(0,2) + '••••••',
        }));
      }

      // Fetch full profile
      try {
        var meData = await api.auth.me();
        if (meData && meData.user) {
          user = meData.user;
          localStorage.setItem('bl_user', JSON.stringify(user));
          // Update pending with fresh autoApproveAt
          if (needsOrg) {
            var pending = JSON.parse(localStorage.getItem('bl_pending') || '{}');
            pending.autoApproveAt = user.autoApproveAt;
            localStorage.setItem('bl_pending', JSON.stringify(pending));
          }
        }
      } catch(me) { /* use register data */ }

      if ((user.role === 'bloodbank' || user.role === 'hospital') && !user.isVerified) {
        window.location.href = '../pages/pending-approval.html';
      } else {
        window.location.href = getDashboardUrl(user.role);
      }
    } catch(err) {
      showFormAlert('registerAlert', 'error', err.message);
      setLoading('registerBtn', false);
    }
  });
}

/* ─── 7. FORGOT PASSWORD ────────────────── */
var forgotModal = null;

function showForgotPassword() {
  if (!forgotModal) {
    forgotModal = document.createElement('div');
    forgotModal.id = 'forgotModal';
    forgotModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    forgotModal.innerHTML =
      '<div style="background:#fff;border-radius:20px;padding:28px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<h3 style="font-size:1rem;font-weight:700;margin-bottom:6px">Reset your password</h3>' +
        '<p style="font-size:.82rem;color:#888;margin-bottom:20px;line-height:1.6">Enter your registered email address. We\'ll send instructions to reset your password.</p>' +
        '<div class="form-group">' +
          '<label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">Email address</label>' +
          '<input type="email" id="forgotEmail" placeholder="you@example.com" style="width:100%;padding:10px 14px;font-family:inherit;font-size:.9rem;border:1.5px solid #E8E7E4;border-radius:10px;outline:none;color:#0E0E0E" autocomplete="email"/>' +
        '</div>' +
        '<div id="forgotAlert" class="form-alert" style="display:none;margin-bottom:12px"></div>' +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<button onclick="closeForgotPassword()" style="flex:1;padding:11px;border:1.5px solid #E8E7E4;border-radius:10px;font-family:inherit;font-size:.88rem;font-weight:600;color:#888;cursor:pointer;background:#fff">Cancel</button>' +
          '<button onclick="submitForgotPassword()" style="flex:1;padding:11px;background:#E8221A;color:#fff;border:none;border-radius:10px;font-family:inherit;font-size:.88rem;font-weight:700;cursor:pointer">Send reset link</button>' +
        '</div>' +
        '<p style="font-size:.72rem;color:#bbb;text-align:center;margin-top:14px;line-height:1.6">If this email is registered, you\'ll receive a reset link shortly. Check your spam folder too.</p>' +
      '</div>';
    forgotModal.addEventListener('click', function(e) { if (e.target === forgotModal) closeForgotPassword(); });
    document.body.appendChild(forgotModal);
  }
  forgotModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(function() { var el = document.getElementById('forgotEmail'); if (el) el.focus(); }, 100);
}

function closeForgotPassword() {
  if (forgotModal) { forgotModal.style.display = 'none'; document.body.style.overflow = ''; }
  var alertEl = document.getElementById('forgotAlert');
  if (alertEl) alertEl.style.display = 'none';
  var emailEl = document.getElementById('forgotEmail');
  if (emailEl) emailEl.value = '';
}

async function submitForgotPassword() {
  var emailEl  = document.getElementById('forgotEmail');
  var alertEl  = document.getElementById('forgotAlert');
  var btn      = forgotModal.querySelector('button:last-child');
  var email    = emailEl ? emailEl.value.trim() : '';

  if (!email || !isEmail(email)) {
    if (alertEl) { alertEl.className='form-alert error'; alertEl.textContent='Please enter a valid email address'; alertEl.style.display='block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  if (alertEl) alertEl.style.display = 'none';

  try {
    // Try the password reset API endpoint
    await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    if (alertEl) {
      alertEl.className   = 'form-alert success';
      alertEl.textContent = '✓ If this email is registered, a reset link has been sent. Check your inbox.';
      alertEl.style.display = 'block';
    }
    if (emailEl) emailEl.value = '';
    if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
  } catch(err) {
    // Even on error (e.g. email not found), show success for security (don't reveal if email exists)
    if (alertEl) {
      alertEl.className   = 'form-alert success';
      alertEl.textContent = '✓ If this email is registered, a reset link has been sent. Check your inbox.';
      alertEl.style.display = 'block';
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
  }
}

/* ─── HELPERS ──────────────────────────── */
function setLoading(id, on) {
  var b = document.getElementById(id); if (!b) return;
  b.disabled = on;
  var text   = b.querySelector('.btn-text');
  var loader = b.querySelector('.btn-loader');
  if (text)   text.style.display   = on ? 'none'   : 'inline';
  if (loader) loader.style.display = on ? 'inline' : 'none';
}

function showFormAlert(id, type, msg) {
  var el = document.getElementById(id); if (!el) return;
  el.className = 'form-alert ' + type;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function getDashboardUrl(role) {
  var map = {
    patient:   'dashboard-patient.html',
    bloodbank: 'dashboard-bank.html',
    hospital:  'dashboard-patient.html',
    admin:     'dashboard-admin.html',
  };
  return map[role] || 'index.html';
}
