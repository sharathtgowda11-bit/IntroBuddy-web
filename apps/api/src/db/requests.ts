import type { PoolClient } from "pg";

export type RequestType = "mentorship" | "referral";
export type RequestStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";

export interface RequestRecord {
  id: string;
  studentCollegeUserId: string;
  alumnusCollegeUserId: string;
  type: RequestType;
  opportunityId: string | null;
  message: string;
  status: RequestStatus;
  responseMessage: string | null;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RequestRow {
  id: string;
  student_college_user_id: string;
  alumnus_college_user_id: string;
  type: RequestType;
  opportunity_id: string | null;
  message: string;
  status: RequestStatus;
  response_message: string | null;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    studentCollegeUserId: row.student_college_user_id,
    alumnusCollegeUserId: row.alumnus_college_user_id,
    type: row.type,
    opportunityId: row.opportunity_id,
    message: row.message,
    status: row.status,
    responseMessage: row.response_message,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message,
  status, response_message, responded_at, created_at, updated_at
`;

export interface CreateRequestParams {
  tenantId: string;
  studentCollegeUserId: string;
  alumnusCollegeUserId: string;
  type: RequestType;
  opportunityId: string | null;
  message: string;
}

export async function createRequest(client: PoolClient, params: CreateRequestParams): Promise<RequestRecord> {
  const result = await client.query<RequestRow>(
    `insert into public.requests (tenant_id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message)
     values ($1, $2, $3, $4, $5, $6)
     returning ${SELECT_COLUMNS}`,
    [params.tenantId, params.studentCollegeUserId, params.alumnusCollegeUserId, params.type, params.opportunityId, params.message],
  );
  return mapRow(result.rows[0]);
}

// The base RequestRecord has no notion of who the counterparty *is* --
// just their id -- which is unusable for a list a human actually reads
// (an alumnus needs to know who's asking; a student needs to know which
// alumnus and what they said their company is). These two list-only
// shapes join in exactly the display fields each audience needs, without
// widening the base record every other function in this file returns.

export interface SentRequestListItem extends RequestRecord {
  alumnusName: string | null;
  alumnusCompany: string | null;
  opportunityTitle: string | null;
}

interface SentRequestRow extends RequestRow {
  alumnus_name: string | null;
  alumnus_company: string | null;
  opportunity_title: string | null;
}

/** GET /requests/sent -- own only, with the alumnus's name/company and (for referrals) the opportunity title joined in for display. */
export async function listSentRequests(client: PoolClient, studentCollegeUserId: string): Promise<SentRequestListItem[]> {
  const result = await client.query<SentRequestRow>(
    `select r.id, r.student_college_user_id, r.alumnus_college_user_id, r.type, r.opportunity_id, r.message,
            r.status, r.response_message, r.responded_at, r.created_at, r.updated_at,
            cu.name as alumnus_name, ap.company as alumnus_company, o.title as opportunity_title
     from public.requests r
     join public.college_users cu on cu.id = r.alumnus_college_user_id
     left join public.alumni_profiles ap on ap.college_user_id = r.alumnus_college_user_id
     left join public.opportunities o on o.id = r.opportunity_id
     where r.student_college_user_id = $1
     order by r.created_at desc`,
    [studentCollegeUserId],
  );
  return result.rows.map((row) => ({
    ...mapRow(row),
    alumnusName: row.alumnus_name,
    alumnusCompany: row.alumnus_company,
    opportunityTitle: row.opportunity_title,
  }));
}

export interface ReceivedRequestListItem extends RequestRecord {
  studentName: string | null;
  studentEmail: string;
  opportunityTitle: string | null;
}

interface ReceivedRequestRow extends RequestRow {
  student_name: string | null;
  student_email: string;
  opportunity_title: string | null;
}

/** GET /requests/received -- own only, with the student's name/email and (for referrals) the opportunity title joined in for display. */
export async function listReceivedRequests(
  client: PoolClient,
  alumnusCollegeUserId: string,
): Promise<ReceivedRequestListItem[]> {
  const result = await client.query<ReceivedRequestRow>(
    `select r.id, r.student_college_user_id, r.alumnus_college_user_id, r.type, r.opportunity_id, r.message,
            r.status, r.response_message, r.responded_at, r.created_at, r.updated_at,
            cu.name as student_name, cu.email as student_email, o.title as opportunity_title
     from public.requests r
     join public.college_users cu on cu.id = r.student_college_user_id
     left join public.opportunities o on o.id = r.opportunity_id
     where r.alumnus_college_user_id = $1
     order by r.created_at desc`,
    [alumnusCollegeUserId],
  );
  return result.rows.map((row) => ({
    ...mapRow(row),
    studentName: row.student_name,
    studentEmail: row.student_email,
    opportunityTitle: row.opportunity_title,
  }));
}

/** Application-layer ownership check for PATCH /requests/:id/respond -- re-checked even though the row is already tenant-scoped by RLS. */
export async function findOwnReceivedRequestById(
  client: PoolClient,
  id: string,
  alumnusCollegeUserId: string,
): Promise<RequestRecord | null> {
  const result = await client.query<RequestRow>(
    `select ${SELECT_COLUMNS} from public.requests where id = $1 and alumnus_college_user_id = $2`,
    [id, alumnusCollegeUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/** Application-layer ownership check for PATCH /requests/:id/withdraw. */
export async function findOwnSentRequestById(
  client: PoolClient,
  id: string,
  studentCollegeUserId: string,
): Promise<RequestRecord | null> {
  const result = await client.query<RequestRow>(
    `select ${SELECT_COLUMNS} from public.requests where id = $1 and student_college_user_id = $2`,
    [id, studentCollegeUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface SetRequestResponseParams {
  status: "accepted" | "declined";
  responseMessage?: string;
}

/** The caller must have already verified ownership and pending status via findOwnReceivedRequestById -- this is a plain update by id, same select-then-update precedent as setStudentStatus. */
export async function setRequestResponse(client: PoolClient, id: string, params: SetRequestResponseParams): Promise<void> {
  await client.query(
    `update public.requests set status = $2, response_message = $3, responded_at = now(), updated_at = now() where id = $1`,
    [id, params.status, params.responseMessage ?? null],
  );
}

export async function setRequestWithdrawn(client: PoolClient, id: string): Promise<void> {
  await client.query(`update public.requests set status = 'withdrawn', updated_at = now() where id = $1`, [id]);
}
