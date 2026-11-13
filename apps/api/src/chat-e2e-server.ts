/** Test-only server: isolate media generation from external providers. */
import 'dotenv/config';
if (process.env.NODE_ENV !== 'test') throw new Error('Servidor de E2E exige NODE_ENV=test');
const { studioAiService, studioVideoService } = await import('./di.js');
studioAiService.generateImage = async () => ({ type: 'image', imageUrl: 'https://example.invalid/imagem-e2e.png', assetId: 'isolated-image' });
studioAiService.editChatImage = async (_tenant, body) => ({type:'image',assetId:body.assetId,imageUrl:'https://example.invalid/imagem-editada.png',creativeData:{headline:'',primary_text:'',cta:''},modificationsRemaining:null});
studioVideoService.adjustChatVideo = async (_tenant, _asset, _version, _feedback, _user, operationId) => ({jobId:operationId!});
studioVideoService.createJob = async (_tenant, _body, _user, operationId) => ({ jobId: operationId! });
studioVideoService.getJob = async (_tenant, jobId) => ({ jobId, status:'done', stage:'done', prompt:'Teste isolado', error:null, assetId:null, videoUrl:'https://example.invalid/video-e2e.mp4', createdAt:'2030-01-01T00:00:00Z' });
const { campaignsService } = await import('./services/campaigns/campaigns.service.js');
campaignsService.updateChatCampaign = async args => ({ id: args.campaignId, status: 'PAUSED' });
campaignsService.createChatAd = async () => ({id:'12345',status:'PAUSED'});
campaignsService.updateChatAd = async args => ({ id: args.adId, status: 'PAUSED' });
const { default: app } = await import('./index.js');
const port = Number(process.env.PORT ?? 3199);
app.listen(port, '127.0.0.1', () => console.log(`Chat E2E API listening on ${port}`));
