export function handleLogout(navigate, setUserData) {
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    window.dispatchEvent(new Event('authStateChanged'));
    setUserData(null);
    navigate('/login');
}