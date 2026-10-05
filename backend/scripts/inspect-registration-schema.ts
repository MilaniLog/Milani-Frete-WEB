import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
async function main(){const db=new PrismaService();try{
 console.log(JSON.stringify(await db.$queryRaw`SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('vehicle','driver') AND REFERENCED_TABLE_NAME IS NOT NULL`));
}finally{await db.$disconnect();}} void main();
