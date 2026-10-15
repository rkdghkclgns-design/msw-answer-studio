import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { EvalApp } from './EvalApp';

const root = document.getElementById('root');
if (!root) throw new Error('#root 요소가 없습니다.');

createRoot(root).render(
  <StrictMode>
    <EvalApp />
  </StrictMode>,
);
