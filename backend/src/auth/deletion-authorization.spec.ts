import { DeletionAuthorizationService } from './deletion-authorization.service';
import { JwtAuthGuard } from './jwt-auth.guard';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('argon2', () => ({ verify: jest.fn(async (_hash, password) => password === 'correct') }));
function setup() {
  const db = { employees: { findUnique: jest.fn(async ({where}) => where.cod === 2 ? {id: 1, isAdmin: false} : {isAdmin: true, password: '$argon2-test'}) } };
  const service = new DeletionAuthorizationService(db as any);
  const request: any = { method: 'DELETE', path: '/registrations/vehicles/ABC1234', user: {sub:1,cod:2,unit:100,isAdmin:false}, body: {} };
  return { db, service, request };
}
it('bloqueia DELETE direto sem senha e ignora elevação enviada pelo cliente', async () => {
  const {service,request} = setup(); request.user.isAdmin = true; request.user.deletionApprovedBy = 8;
  await expect(service.authorize(request)).rejects.toMatchObject({response:{code:'ADMIN_APPROVAL_REQUIRED'}});
  expect(request.user.deletionApprovedBy).toBeUndefined();
});
it('permite ADM atual sem senha adicional', async () => {
  const {db,service,request} = setup(); db.employees.findUnique.mockResolvedValue({id:1,isAdmin:true} as any);
  await expect(service.authorize(request)).resolves.toBeUndefined();
});
it('autoriza somente a exclusão atual e preserva operador e unidade', async () => {
  const {service,request} = setup(); request.body.admin_authorization = {cod:8,password:'correct'};
  await service.authorize(request);
  expect(request.body).toEqual({});
  expect(request.user).toEqual({sub:1,cod:2,unit:100,isAdmin:false,deletionApprovedBy:8});
  await expect(service.authorize(request)).rejects.toMatchObject({status:403});
});
it('rejeita senha errada e limita tentativas', async () => {
  const {service,request} = setup();
  for(let i=0;i<5;i++) {
    request.body.admin_authorization = {cod:8,password:'wrong'};
    await expect(service.authorize(request)).rejects.toMatchObject({status:403});
  }
  request.body.admin_authorization = {cod:8,password:'correct'};
  await expect(service.authorize(request)).rejects.toThrow('Muitas tentativas');
});
it('não aceita senha de usuário comum como autorização', async () => {
  const {db,service,request} = setup(); db.employees.findUnique.mockImplementation(async ({where}) => where.cod === 2 ? {id:1,isAdmin:false} : {isAdmin:false,password:'correct'} as any);
  request.body.admin_authorization = {cod:8,password:'correct'};
  await expect(service.authorize(request)).rejects.toMatchObject({status:403});
});
it('não solicita autorização administrativa para consulta ou edição', async () => {
  const {service,request,db} = setup();
  for (const method of ['GET','POST','PUT']) { request.method=method; await service.authorize(request); }
  expect(db.employees.findUnique).not.toHaveBeenCalled();
});
it('guard JWT aplica a autorização sem transformar recusa em sessão expirada', async () => {
  const {service,request} = setup(); request.headers={authorization:'Bearer test'};
  const guard = new JwtAuthGuard({verifyAsync:async()=>request.user} as any,{getOrThrow:()=> 'test-secret'} as any,service);
  await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as any)).rejects.toMatchObject({status:403});
});
