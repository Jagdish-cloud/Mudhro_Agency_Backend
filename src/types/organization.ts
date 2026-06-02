export type OrganizationRegistrationRequest = {
  organization: {
    name: string;
    address: string;
    gstNumber: string | null;
    isUnregistered: boolean;
    companyPan: string;
    companyMobile: string;
    companyEmail: string;
  };
  contactPersons: Array<{
    name: string;
    email: string;
    number: string;
    designation: string;
  }>;
  admins: Array<{
    name: string;
    email: string;
    number: string;
    designation: string;
    password: string;
  }>;
};

export type RegisterOrganizationResult = {
  id: string;
  organizationName: string;
  message: string;
};

export type OrganizationContactPersonDto = {
  id: string;
  name: string;
  email: string;
  number: string;
  designation: string;
};

export type OrganizationProfileDto = {
  id: string;
  name: string;
  address: string;
  gstNumber: string | null;
  isUnregistered: boolean;
  companyPan: string;
  companyMobile: string;
  companyEmail: string;
  contactPersons: OrganizationContactPersonDto[];
  createdAt: string;
  updatedAt: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  address: string;
  gst_number: string | null;
  is_unregistered: boolean;
  company_pan: string;
  company_mobile: string;
  company_email: string;
  created_at: Date;
  updated_at: Date;
};

export type OrganizationContactPersonRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  number: string;
  designation: string;
};
