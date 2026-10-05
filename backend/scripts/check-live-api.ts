import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';

// Real login against the running server, using a temporary non-admin account.
// Operational routes are read-only. No passwords, tokens or record contents logged.
async function main() {
  const prisma = new PrismaService();
  let userId: number | undefined;
  let permissionId: number | undefined;
  const cod = randomInt(1000000000, 2000000000);
  const password = randomBytes(32).toString('hex');
  const base = process.env.LIVE_API_URL || 'http://127.0.0.1:3000';
  let count = 0;
  async function call(
    path: string,
    status: number,
    token?: string,
    body?: unknown,
  ) {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(
      response.status,
      status,
      `HTTP check ${count + 1}: expected ${status}, received ${response.status}`,
    );
    count++;
    return response.json();
  }
  try {
    await prisma.$connect();
    const template = await prisma.employees.findFirst({
      select: { unit: true },
    });
    assert(template, 'An existing unit is required.');
    const created = await prisma.employees.create({
      data: {
        cod,
        Name: 'TESTE TEMPORARIO INTERFACE',
        unit: template.unit,
        isAdmin: false,
        password: await argon2.hash(password),
      },
    });
    userId = created.id;
    const permission = await prisma.user_permissions.create({
      data: {
        cod_user: cod,
        unit: template.unit,
        is_admin: false,
        freight_service: true,
        freight_closure: false,
      },
    });
    permissionId = permission.id;
    await call('/manifests', 401);
    await call('/auth/login', 401, undefined, {
      cod,
      password: randomBytes(32).toString('hex'),
    });
    const session = await call('/auth/login', 201, undefined, {
      cod,
      password,
    });
    assert.equal(session.user.cod, cod);
    assert.equal(session.user.unit, template.unit);
    assert.equal(session.user.isAdmin, false);
    await call('/freight-entries', 401, undefined, {});
    await call('/freight-entries', 400, session.accessToken, {});
    await call('/freight-entries/number/0', 401);
    await call('/freight-entries/number/0', 404, session.accessToken);
    await call('/vehicles/INVALIDA', 401);
    await call('/vehicles/INVALIDA', 400, session.accessToken);
    const vehicleTypes = await prisma.vehicleType.findMany({
      select: { codVehicleType: true },
    });
    const candidates = await prisma.vehicle.findMany({
      where: {
        canceled: false,
        codVehicleType: { in: vehicleTypes.map((type) => type.codVehicleType) },
      },
      select: {
        plate: true,
        first_payer: true,
        second_payer: true,
        second_payer_percent: true,
      },
    });
    const vehicle = candidates.find((item) =>
      /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(item.plate),
    );
    assert(vehicle, 'An active vehicle with a valid plate and type is required.');
    const payers = await call(
      `/vehicles/${encodeURIComponent(vehicle.plate.toLowerCase())}`,
      200,
      session.accessToken,
    );
    assert.equal(payers.plate, vehicle.plate);
    assert.equal(payers.first_payer, vehicle.first_payer);
    assert.equal(payers.second_payer, vehicle.second_payer);
    assert.equal(
      Number(payers.second_payer_percent),
      Number(vehicle.second_payer_percent),
    );
    assert.equal(typeof payers.vehicleType.typeName, 'string');
    const manifests = await call('/manifests', 200, session.accessToken);
    assert(Array.isArray(manifests));
    if (manifests.length) {
      const found = await call(`/manifests?number=${encodeURIComponent(manifests[0].manifestos)}`, 200, session.accessToken);
      assert(found.length > 0);
      assert(found.every((m: any) => m.manifestos === manifests[0].manifestos && m.unit === session.user.unit));
    }
    for (const path of ['/registrations/companies', '/registrations/drivers', '/registrations/vehicles', '/registrations/vehicle-types', '/drivers', '/weeks', '/destinations', '/freight-expenses', '/freight-invoice-types', '/freight-invoices'])
      assert(Array.isArray(await call(path, 200, session.accessToken)));
    await call('/freight-closures', 200, session.accessToken);
    const invoiceRows=await call('/freight-invoices',200,session.accessToken);
    if(invoiceRows.length){
      const invoice=invoiceRows[0];
      const found=await call(`/freight-invoices/by-number?${new URLSearchParams({numero:invoice.numero})}`,200,session.accessToken);
      assert.equal(found.id,invoice.id);
      const coupons=await call(`/freight-invoices/${invoice.id}/coupons`,200,session.accessToken);
      if(coupons.length){const launch=await call(`/freight-invoices/launches/${coupons[0].id}`,200,session.accessToken);assert.equal(launch.nota.id,invoice.id);}
    }
    const conference = await call('/freight-closures/conference?inicio=2026-09-20&fim=2026-09-26',200,session.accessToken);
    for(const kind of ['financial','payments']){
      const result=await call(`/freight-reports/${kind}?inicio=2026-09-20&fim=2026-09-26`,200,session.accessToken);
      assert(Array.isArray(result.rows));assert(Array.isArray(result.totals));
    }
    assert(Array.isArray(conference.groups));
    for(const group of conference.groups) {
      assert([...group.manifests,...group.entries,...group.coupons].every(row=>row.unit===session.user.unit));
      assert.equal(Number(group.payment.segunda.valor),0);
    }
    await prisma.user_permissions.update({
      where: { id: permissionId },
      data: { freight_closure: true },
    });
    const closures = await call('/freight-closures', 200, session.accessToken);
    assert(Array.isArray(closures));
    if (closures.length) {
      const report = await call(
        `/freight-closures/${closures[0].id}/report`,
        200,
        session.accessToken,
      );
      assert.equal(report.cabecalho.unit, template.unit);
    }
    if (manifests.length) {
      const detail = await call(
        `/manifests/${manifests[0].id}`,
        200,
        session.accessToken,
      );
      assert.equal(detail.unit, template.unit);
      assert(
        Array.isArray(
          await call(
            `/manifests/${detail.id}/entries`,
            200,
            session.accessToken,
          ),
        ),
      );
    }
    console.log(
      `${count} live HTTP checks passed (real login and authenticated reads).`,
    );
  } finally {
    try {
      if (permissionId !== undefined)
        await prisma.user_permissions.delete({
          where: { id: permissionId, cod_user: cod },
        });
      if (userId !== undefined)
        await prisma.employees.delete({ where: { id: userId, cod } });
      if (userId !== undefined)
        assert.equal(
          await prisma.employees.count({ where: { id: userId } }),
          0,
        );
      console.log('Temporary test account removed.');
    } finally {
      await prisma.$disconnect();
    }
  }
}
main().catch((error) => {
  console.error(`Live check failed: ${error.name} ${error.code ?? ''}`);
  // Report status mismatches without exposing tokens, credentials or records.
  if (String(error.message).startsWith('HTTP check '))
    console.error(String(error.message).split('\n')[0]);
  process.exitCode = 1;
});
