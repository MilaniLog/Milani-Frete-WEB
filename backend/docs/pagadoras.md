# Pagadoras do veículo

`PUT /vehicles/:plate/payers` substitui a configuração de pagadoras. Exige autenticação e administrador, pois `vehicle` é um cadastro global, sem unidade. Permissão `freight_closure` sozinha não autoriza um usuário comum. A consulta existente `GET /vehicles/:plate` retorna os campos e exige `freight_service` ou administrador.

Exemplo de corpo completo:

```json
{
  "first_payer": "EMPRESA A",
  "second_payer": "EMPRESA B",
  "second_payer_percent": 0.30
}
```

Os três campos são obrigatórios. Nomes têm até 30 caracteres e são aparados; string vazia é persistida como null. Percentual é número JSON de 0 a 1, até seis casas decimais: 0.30 representa 30%. Não aceita string numérica, null ou 30 para indicar 30%. A placa aceita o formato antigo ou Mercosul sem hífen, normalizando espaços externos e letras minúsculas.

Para manter uma única pagadora, envie a primeira empresa, segunda vazia e percentual zero. Para remover toda a configuração, envie ambos os nomes vazios e percentual zero. Segunda empresa sem primeira, nomes iguais e percentual não zero sem segunda empresa retornam 409, usando a mesma validação do fechamento. Contrato inválido retorna 400; veículo ausente ou cancelado, 404; usuário não administrador, 403.

A gravação altera apenas as pagadoras, o percentual e o timestamp automático do veículo. Não cria veículos nem empresas e não altera proprietário, tipo ou status. As próximas conferências usam o novo cadastro; fechamentos já finalizados mantêm a distribuição no histórico. Esta etapa não adiciona interface React, histórico de alterações do cadastro nem mudança de esquema.
