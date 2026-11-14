import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/pages/chat/chat.css'), 'utf8');

describe('mídia compacta no chat', () => {
  it('limita imagens e vídeos gerados e anexados em telas pequenas sem recorte', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.ady-chat-approval\s+:is\(img,\s*video\)[\s\S]*?\.ady-chat-saved-attachment\s+:is\(img,\s*video\)[\s\S]*?max-width:\s*min\(100%,\s*240px\)[\s\S]*?max-height:\s*220px[\s\S]*?object-fit:\s*contain/);
    expect(css).toMatch(/\.ady-chat-markdown\s+:is\(img,\s*video\)/);
    expect(css).toMatch(/@media\s*\(max-height:\s*450px\)[\s\S]*?\.ady-chat-saved-attachment\s+:is\(img,\s*video\)[\s\S]*?max-height:\s*150px/);
  });
  it('não recorta a prévia da imagem anexada no rascunho', () => {
    expect(css).toMatch(/\.ady-chat-file-thumbnail img\s*\{[^}]*object-fit:\s*contain/);
  });
});
