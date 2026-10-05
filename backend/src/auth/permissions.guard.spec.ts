import { PermissionsGuard } from './permissions.guard';
describe('Acesso operacional padrão',()=>{
  it.each(['freight_service','freight_closure'])('libera %s sem cadastro individual de permissão',async permission=>{
    const db={user_permissions:{findFirst:jest.fn()}};
    const guard=new PermissionsGuard({getAllAndOverride:()=>permission} as any,db as any);
    const context={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>({user:{cod:2,unit:100,isAdmin:false}})})};
    expect(await guard.canActivate(context as any)).toBe(true);
    expect(db.user_permissions.findFirst).not.toHaveBeenCalled();
  });
  it('continua exigindo autenticação',async()=>{
    const guard=new PermissionsGuard({getAllAndOverride:()=> 'freight_service'} as any,{} as any);
    const context={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>({})})};
    await expect(guard.canActivate(context as any)).rejects.toMatchObject({status:401});
  });
});
