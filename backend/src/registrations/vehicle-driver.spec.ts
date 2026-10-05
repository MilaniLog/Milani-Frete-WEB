import { RegistrationsService } from './registrations.service';
jest.mock('../prisma/prisma.service',()=>({PrismaService:class {}}));
const user={sub:1,cod:2,unit:100,isAdmin:false};
const dto={plate:'ABC1D23',codVehicleType:1,owner:'52998224725',owner_name:'Proprietário',empresa_sigla:'EX',driver_cpf:'00123456789'};
function setup() {
  const db:any={driver:{findUnique:jest.fn().mockResolvedValue({cpf:123456789n}),findMany:jest.fn().mockResolvedValue([{cpf:123456789n,name:'Motorista'}])},frete_empresas:{findUnique:jest.fn().mockResolvedValue({})},vehicleType:{findUnique:jest.fn().mockResolvedValue({})},companies:{findUnique:jest.fn().mockResolvedValue({})},vehicle:{findUnique:jest.fn().mockResolvedValue({canceled:false}),update:jest.fn().mockImplementation(({data})=>data),findMany:jest.fn().mockResolvedValue([{plate:'ABC1D23',driver_cpf:'00123456789'}])}};
  db.$transaction=(fn:any)=>fn(db);
  return {db,service:new RegistrationsService(db)};
}
it('salva o vínculo pelo CPF preservando zeros, sem alterar manifestos',async()=>{
  const {db,service}=setup();
  const result=await service.vehicle(dto,user,dto.plate);
  expect(result.driver_cpf).toBe('00123456789');
  expect(db.driver.findUnique).toHaveBeenCalledWith({where:{cpf:123456789n},select:{cpf:true}});
});
it('rejeita motorista inexistente e permite remover o vínculo',async()=>{
  const {db,service}=setup();db.driver.findUnique.mockResolvedValue(null);
  await expect(service.vehicle(dto,user,dto.plate)).rejects.toThrow('Motorista não cadastrado');
  expect(db.vehicle.update).not.toHaveBeenCalled();
  expect((await service.vehicle({...dto,driver_cpf:null},user,dto.plate)).driver_cpf).toBeNull();
});
it('lista nome e CPF textual para o preenchimento do manifesto',async()=>{
  const {service}=setup();expect(await service.vehicles()).toEqual([{plate:'ABC1D23',driver_cpf:'00123456789',driver_name:'Motorista'}]);
});
it('vincula proprietario somente a um motorista existente', async () => {
  const { db, service } = setup();
  db.driver.findUnique.mockResolvedValue({ cpf: 123456789n, name: dto.owner_name });
  const result = await service.vehicle({ ...dto, owner_is_driver: true }, user, dto.plate);
  expect(result.driver_cpf).toBe(dto.driver_cpf);
  expect(result).not.toHaveProperty('owner_is_driver');
  db.driver.findUnique.mockResolvedValue(null);
  await expect(service.vehicle({ ...dto, owner_is_driver: true }, user, dto.plate)).rejects.toThrow('Cadastre o motorista');
});
it('confere o nome escolhido sem usar o documento do proprietário', async () => {
  const { db, service } = setup();
  db.driver.findUnique.mockResolvedValue({ cpf: 123456789n, name: dto.owner_name });
  expect((await service.vehicle({ ...dto, owner: '11222333000181', owner_is_driver: true }, user, dto.plate)).driver_cpf).toBe(dto.driver_cpf);
  db.driver.findUnique.mockResolvedValue({ cpf: 123456789n, name: 'Outro motorista' });
  await expect(service.vehicle({ ...dto, owner_is_driver: true }, user, dto.plate)).rejects.toThrow('nome do proprietário');
});
