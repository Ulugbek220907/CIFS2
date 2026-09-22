import './styles.css';
import { bootApp } from './app';

try {
  bootApp(document.getElementById('app'));
} catch (error) {
  console.error('App initialization error:', error);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
      <div style="padding: 2rem; font-family: sans-serif; text-align: center; max-width: 600px; margin: 3rem auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <h2 style="color: #ef4444;">Dastur yuklanishida xatolik yuz berdi</h2>
        <p style="color: #64748b;">${error instanceof Error ? error.message : String(error)}</p>
      </div>
    `;
  }
}
