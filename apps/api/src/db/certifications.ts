import type { PoolClient } from "pg";

export type CertificationType = "workshop" | "internship" | "course";

export interface CertificationRecord {
  id: string;
  collegeUserId: string;
  name: string;
  type: CertificationType;
  issuingOrganisation: string;
  date: string | null;
  certificateUrl: string | null;
}

interface CertificationRow {
  id: string;
  college_user_id: string;
  name: string;
  type: CertificationType;
  issuing_organisation: string;
  date: string | null;
  certificate_url: string | null;
}

function mapRow(row: CertificationRow): CertificationRecord {
  return {
    id: row.id,
    collegeUserId: row.college_user_id,
    name: row.name,
    type: row.type,
    issuingOrganisation: row.issuing_organisation,
    date: row.date,
    certificateUrl: row.certificate_url,
  };
}

const SELECT_COLUMNS = "id, college_user_id, name, type, issuing_organisation, date, certificate_url";

export async function listCertifications(client: PoolClient, collegeUserId: string): Promise<CertificationRecord[]> {
  const result = await client.query<CertificationRow>(
    `select ${SELECT_COLUMNS} from public.certifications where college_user_id = $1 order by created_at`,
    [collegeUserId],
  );
  return result.rows.map(mapRow);
}

export interface CreateCertificationParams {
  tenantId: string;
  collegeUserId: string;
  name: string;
  type: CertificationType;
  issuingOrganisation: string;
  date?: string | null;
  certificateUrl?: string | null;
}

export async function createCertification(client: PoolClient, params: CreateCertificationParams): Promise<CertificationRecord> {
  const result = await client.query<CertificationRow>(
    `insert into public.certifications (tenant_id, college_user_id, name, type, issuing_organisation, date, certificate_url)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${SELECT_COLUMNS}`,
    [
      params.tenantId,
      params.collegeUserId,
      params.name,
      params.type,
      params.issuingOrganisation,
      params.date ?? null,
      params.certificateUrl ?? null,
    ],
  );
  return mapRow(result.rows[0]);
}

export interface UpdateCertificationParams {
  name?: string;
  type?: CertificationType;
  issuingOrganisation?: string;
  date?: string | null;
  certificateUrl?: string | null;
}

/** Ownership (college_user_id = the caller's own id) is checked by the route, not here -- RLS alone only enforces tenant scoping, not one student's rows vs. another's in the same tenant. */
export async function updateCertification(
  client: PoolClient,
  id: string,
  collegeUserId: string,
  params: UpdateCertificationParams,
): Promise<CertificationRecord | null> {
  const result = await client.query<CertificationRow>(
    `update public.certifications set
       name = coalesce($3, name),
       type = coalesce($4, type),
       issuing_organisation = coalesce($5, issuing_organisation),
       date = coalesce($6, date),
       certificate_url = coalesce($7, certificate_url),
       updated_at = now()
     where id = $1 and college_user_id = $2
     returning ${SELECT_COLUMNS}`,
    [id, collegeUserId, params.name ?? null, params.type ?? null, params.issuingOrganisation ?? null, params.date ?? null, params.certificateUrl ?? null],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function deleteCertification(client: PoolClient, id: string, collegeUserId: string): Promise<boolean> {
  const result = await client.query(`delete from public.certifications where id = $1 and college_user_id = $2`, [
    id,
    collegeUserId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
