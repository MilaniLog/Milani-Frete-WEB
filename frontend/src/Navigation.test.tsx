// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import Navigation from './Navigation';
afterEach(cleanup);
function menu(service:boolean,closure:boolean,unit=100,admin=false){
 render(<Navigation session={{accessToken:'test',user:{id:1,cod:1,name:'Teste',unit:100,isAdmin:admin},permissions:[{unit,freight_service:service,freight_closure:closure}]}} page="home" navigate={vi.fn()} logout={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/Menu/}));
}
it('libera páginas normais mesmo sem permissões individuais',()=>{
 menu(false,false);
 for(const name of ['Motoristas','Veículos','Manifestos','Despesas','Fechamentos','Lançamentos','Empresas','Notas e cupons']) expect(screen.getByRole('button',{name})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Semanas'})).toBeNull();
});
it('usuário financeiro também tem acesso operacional padrão',()=>{
 menu(false,true);expect(screen.getByRole('button',{name:'Fechamentos'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Motoristas'})).toBeTruthy();
});
it('ignora permissões de outra unidade',()=>{
 menu(true,true,301);
 expect(screen.getByRole('button',{name:'Manifestos'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Fechamentos'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Home'})).toBeNull();
});
it('administrador mantém todas as telas',()=>{
 menu(false,false,100,true);expect(screen.getByRole('button',{name:'Semanas'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Veículos'})).toBeTruthy();
});
