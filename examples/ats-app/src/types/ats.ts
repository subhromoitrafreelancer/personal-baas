export type AtsRole = 'ADMIN' | 'BDE' | 'TL' | 'STL' | 'RECRUITER';

export interface Department {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  user_id: string;
  email: string;
  full_name: string;
  role: AtsRole | null;
  department_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Requirement {
  id: string;
  client_id: string;
  job_title: string;
  skills: string | null;
  exp_min_years: number | null;
  exp_max_years: number | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  number_of_openings: number;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export type JobStatus = 'OPEN' | 'IN_PROGRESS' | 'FILLED' | 'CANCELLED';

export interface JobPosition {
  id: string;
  requirement_id: string | null;
  department_id: string;
  title: string;
  description: string | null;
  status: JobStatus;
  assigned_tl_id: string | null;
  openings: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RecruiterAssignment {
  id: string;
  job_position_id: string;
  recruiter_id: string;
  assigned_at: string;
}

export interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  current_location: string | null;
  skills: string | null;
  experience_years: number | null;
  created_by_recruiter_id: string;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  candidate_id: string;
  job_position_id: string;
  recruiter_id: string;
  workflow_instance_id: string | null;
  created_at: string;
}

export interface WorkflowState {
  id: string;
  definition_id: string;
  state_name: string;
  label: string;
  is_initial: boolean;
  is_final: boolean;
  display_order: number;
}

export interface WorkflowTransition {
  id: string;
  definition_id: string;
  from_state: string;
  to_state: string;
  transition_name: string;
  allowed_roles: AtsRole[];
  requires_note: boolean;
  display_label: string | null;
}

export interface WorkflowInstance {
  id: string;
  definition_id: string;
  entity_type: string;
  entity_id: string;
  current_state: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTransitionLog {
  id: string;
  instance_id: string;
  from_state: string;
  to_state: string;
  performed_by: string;
  performed_at: string;
  note: string | null;
}

export interface Document {
  id: string;
  candidate_id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export type InterviewMode = 'PHONE' | 'VIDEO' | 'IN_PERSON';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface Interview {
  id: string;
  application_id: string;
  scheduled_at: string;
  interviewer_name: string;
  mode: InterviewMode;
  status: InterviewStatus;
  feedback: string | null;
  scheduled_by: string;
  created_at: string;
  updated_at: string;
}
