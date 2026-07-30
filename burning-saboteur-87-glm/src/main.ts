import './styles.css';
import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('Missing #game-canvas element.');

const game = new Game(canvas);
game.start();

// Resume audio on first user gesture (autoplay policy).
const resumeAudio = () => {
  game.resumeAudio();
  window.removeEventListener('pointerdown', resumeAudio);
  window.removeEventListener('keydown', resumeAudio);
};
window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
