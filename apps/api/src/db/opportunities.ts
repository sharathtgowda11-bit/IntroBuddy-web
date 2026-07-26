import type { PoolClient } from "pg";
import { ALUMNI_PROFILE_COMPLETE_SQL } from "./alumniProfiles.js";

export type OpportunityType = "job" | "internship" | "referral";
export type OpportunityStatus = "open" | "closed" | "expired";

export interface OpportunityRecord {
  id: string;
  postedByCollegeUserId: string;
  type: OpportunityType;
  title: string;
  description: string | null;
  company: string | null;
  location: string | null;
  applyUrl: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface OpportunityRow {
  id: string;
  posted_by_college_user_id: string;
  type: OpportunityType;
  title: string;
  description: string | null;
  company: string | null;
  location: string | null;
  apply_url: string | null;
  deadline: string | null;
  status: OpportunityStatus;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: OpportunityRow): OpportunityRecord {
  return {
    id: row.id,
    postedByCollegeUserId: row.posted_by_college_user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    company: row.company,
    location: row.location,
    applyUrl: row.apply_url,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = [
  "id",
  "posted_by_college_user_id",
  "type",
  "title",
  "description",
  "company",
  "location",
  "apply_url",
  "deadline",
  "status",
  "created_at",
  "updated_at",
];
const SELECT_COLUMNS = COLUMNS.join(", ");
const SELECT_COLUMNS_PREFIXED = COLUMNS.map((c) => `o.${c}`).join(", ");

export interface CreateOpportunityParams {
  tenantId: string;
  postedByCollegeUserId: string;
  type: OpportunityType;
  title: string;
  description?: string;
  company?: string;
  location?: string;
  applyUrl?: string;
  deadline?: string;
}

export async function createOpportunity(client: PoolClient, params: CreateOpportunityParams): Promise<OpportunityRecord> {
  const result = await client.query<OpportunityRow>(
    `insert into public.opportunities
       (tenant_id, posted_by_college_user_id, type, title, description, company, location, apply_url, deadline)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${SELECT_COLUMNS}`,
    [
      params.tenantId,
      params.postedByCollegeUserId,
      params.type,
      params.title,
      params.description ?? null,
      params.company ?? null,
      params.location ?? null,
      params.applyUrl ?? null,
      params.deadline ?? null,
    ],
  );
  return mapRow(result.rows[0]);
}

/** Unscoped by owner -- used internally (e.g. request creation's referral-opportunity check), never exposed to a caller without its own ownership check. */
export async function findOpportunityById(client: PoolClient, id: string): Promise<OpportunityRecord | null> {
  const result = await client.query<OpportunityRow>(`select ${SELECT_COLUMNS} from public.opportunities where id = $1`, [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/** Application-layer ownership check (RLS alone only isolates the tenant, not one alumnus's postings from another's). Used by PATCH/DELETE for the 404-on-not-owned precedent. */
export async function findOwnOpportunityById(
  client: PoolClient,
  id: string,
  postedByCollegeUserId: string,
): Promise<OpportunityRecord | null> {
  const result = await client.query<OpportunityRow>(
    `select ${SELECT_COLUMNS} from public.opportunities where id = $1 and posted_by_college_user_id = $2`,
    [id, postedByCollegeUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/** GET /opportunities/mine -- own postings, all statuses. */
export async function listOwnOpportunities(client: PoolClient, postedByCollegeUserId: string): Promise<OpportunityRecord[]> {
  const result = await client.query<OpportunityRow>(
    `select ${SELECT_COLUMNS} from public.opportunities where posted_by_college_user_id = $1 order by created_at desc`,
    [postedByCollegeUserId],
  );
  return result.rows.map(mapRow);
}

/** The alumni-directory detail view's "open opportunities" list -- open only, unlike listOwnOpportunities (which is the alumnus's own all-statuses dashboard view). */
export async function listOpenOpportunitiesByPoster(
  client: PoolClient,
  postedByCollegeUserId: string,
): Promise<OpportunityRecord[]> {
  const result = await client.query<OpportunityRow>(
    `select ${SELECT_COLUMNS} from public.opportunities where posted_by_college_user_id = $1 and status = 'open' order by created_at desc`,
    [postedByCollegeUserId],
  );
  return result.rows.map(mapRow);
}

export interface ListOpenOpportunitiesFilters {
  type?: OpportunityType;
  company?: string;
  search?: string;
}

/** GET /opportunities -- student browse. Filters to open, posted by an alumnus who is active and profile-complete -- the same visibility gate as the directory. */
export async function listOpenOpportunities(
  client: PoolClient,
  filters: ListOpenOpportunitiesFilters,
): Promise<OpportunityRecord[]> {
  const conditions = [`o.status = 'open'`, `cu.status = 'active'`, ALUMNI_PROFILE_COMPLETE_SQL];
  const params: unknown[] = [];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`o.type = $${params.length}`);
  }
  if (filters.company) {
    params.push(`%${filters.company}%`);
    conditions.push(`o.company ilike $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`o.title ilike $${params.length}`);
  }

  const result = await client.query<OpportunityRow>(
    `select ${SELECT_COLUMNS_PREFIXED}
     from public.opportunities o
     join public.college_users cu on cu.id = o.posted_by_college_user_id
     left join public.alumni_profiles ap on ap.college_user_id = cu.id
     where ${conditions.join(" and ")}
     order by o.created_at desc`,
    params,
  );
  return result.rows.map(mapRow);
}

export interface UpdateOpportunityParams {
  type?: OpportunityType;
  title?: string;
  description?: string;
  company?: string;
  location?: string;
  applyUrl?: string;
  deadline?: string;
  status?: OpportunityStatus;
}

/** Partial update, coalesce-on-undefined -- same convention as updateStudentManagedFields. Supports status transitions (open -> closed). */
export async function updateOpportunity(client: PoolClient, id: string, params: UpdateOpportunityParams): Promise<void> {
  await client.query(
    `update public.opportunities set
       type = coalesce($2, type),
       title = coalesce($3, title),
       description = coalesce($4, description),
       company = coalesce($5, company),
       location = coalesce($6, location),
       apply_url = coalesce($7, apply_url),
       deadline = coalesce($8, deadline),
       status = coalesce($9, status),
       updated_at = now()
     where id = $1`,
    [
      id,
      params.type ?? null,
      params.title ?? null,
      params.description ?? null,
      params.company ?? null,
      params.location ?? null,
      params.applyUrl ?? null,
      params.deadline ?? null,
      params.status ?? null,
    ],
  );
}

/** Left to throw Postgres error 23503 if a requests row still references it -- the route translates this to 409, same pattern as deleteDegree. */
export async function deleteOpportunity(client: PoolClient, id: string): Promise<void> {
  await client.query(`delete from public.opportunities where id = $1`, [id]);
}
