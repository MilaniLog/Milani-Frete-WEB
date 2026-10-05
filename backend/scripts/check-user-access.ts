import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
async function main(){const db=new PrismaService();try{
 const user=await db.employees.findUnique({where:{cod:2},select:{cod:true,unit:true,isAdmin:true}});
 if(process.argv.includes('--grant-freight')) {
  if(!user || user.unit!==100 || user.isAdmin) throw new Error('User context changed; no update applied');
  await db.$transaction(async tx=>{
   const rows=await tx.user_permissions.findMany({where:{cod_user:2,unit:100}});
   if(rows.length>1) throw new Error('Multiple permission rows; no update applied');
   if(rows.length) await tx.user_permissions.update({where:{id:rows[0].id},data:{freight_service:true}});
   else await tx.user_permissions.create({data:{cod_user:2,unit:100,is_admin:false,freight_service:true,freight_closure:false,stock_service:false,ticket_service:false}});
  },{isolationLevel:'Serializable'});
 }
 const permissions=await db.user_permissions.findMany({where:{cod_user:2},select:{id:true,unit:true,is_admin:true,freight_service:true,freight_closure:true}});
 console.log(JSON.stringify({user,permissions}));
}finally{await db.$disconnect();}}void main();
