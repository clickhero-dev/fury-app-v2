/*
Funcionalidade: editar imagem aprovada pelo chat
Cenário: editar versão aprovada consumindo cota
Dado um criativo de imagem na versão aprovada
Quando o assistente pede a edição
Então usa a imagem aprovada e consome a cota de modificação
Cenário: rejeitar versão antiga
Dado um criativo alterado após a proposta
Quando a versão antiga é usada
Então a edição é rejeitada sem consumir cota
Cenário: rejeitar vídeo não suportado
Dado um vídeo
Quando a edição de imagem é solicitada
Então a operação informa que não é suportada
Cenário: estornar cota em falha do provedor
Dado uma imagem aprovada
Quando o provedor falha durante a edição
Então a cota consumida é estornada
*/
import { describe,it,expect,vi } from 'vitest';
import { StudioAiService } from '../services/studio/studio-ai.service.js';
const asset = {id:'asset',rootAssetId:null,type:'image',url:'https://cdn/image.jpg'};
function setup(found: any = asset) {
 const repo = { findAssetByIdAndVersion:vi.fn().mockResolvedValue(found), findAssetById:vi.fn().mockResolvedValue(asset), createAsset:vi.fn().mockImplementation(async (d:any)=>({id:'new',...d})) };
 const llm = { generateImageWithMeta:vi.fn().mockResolvedValue({dataUrl:'data:image/png;base64,AAAA',costUsd:0}) };
 const quota = { consumeModificationQuota:vi.fn().mockResolvedValue(undefined), refundModificationQuota:vi.fn().mockResolvedValue(undefined) };
 const svc = new StudioAiService(() => repo as any,llm as any,quota as any);
 return {svc,repo,llm,quota};
}
describe('editar imagem pelo chat', () => {
 it('consome cota e usa asset aprovado', async () => {
   const {svc,repo,quota,llm}=setup(); await svc.editChatImage('tenant',{assetId:'asset',version:'10',feedback:'troque o fundo'});
   expect(repo.findAssetByIdAndVersion).toHaveBeenCalledWith('asset','10');
   expect(quota.consumeModificationQuota).toHaveBeenCalledWith('asset');
   expect(llm.generateImageWithMeta).toHaveBeenCalledWith(expect.objectContaining({referenceImageUrls:[asset.url]}));
 });
 it('recusa versão obsoleta sem consumir cota', async () => {
   const {svc,quota}=setup(null); await expect(svc.editChatImage('tenant',{assetId:'asset',version:'10',feedback:'troque o fundo'})).rejects.toMatchObject({statusCode:409});
   expect(quota.consumeModificationQuota).not.toHaveBeenCalled();
 });
 it('recusa vídeo', async () => {
   const {svc,quota}=setup({...asset,type:'video'}); await expect(svc.editChatImage('tenant',{assetId:'asset',version:'10',feedback:'troque o fundo'})).rejects.toMatchObject({statusCode:400});
   expect(quota.consumeModificationQuota).not.toHaveBeenCalled();
 });
 it('estorna cota quando provedor falha', async () => {
   const {svc,quota,llm}=setup(); llm.generateImageWithMeta.mockRejectedValueOnce(Error('falha'));
   await expect(svc.editChatImage('tenant',{assetId:'asset',version:'10',feedback:'troque o fundo'})).rejects.toThrow();
   expect(quota.refundModificationQuota).toHaveBeenCalledWith('asset');
 });
});
