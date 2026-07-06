import { Game } from './game/Game';
import { initDebugMenu } from './game/debug';

const canvas = document.getElementById('game') as HTMLCanvasElement;
new Game(canvas).start();
initDebugMenu();
