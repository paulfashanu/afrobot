import './ui/style.css';
import { Game } from './core/Game';

const app = document.getElementById('app')!;

// Wait for the UI font so canvas-drawn signs use it too.
const ready = document.fonts?.load ? document.fonts.load('700 32px Fredoka').catch(() => undefined) : Promise.resolve();
void ready.then(() => new Game(app));
