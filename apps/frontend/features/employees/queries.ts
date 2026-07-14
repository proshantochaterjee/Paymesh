import { useQuery } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { Employee } from "@workforceos/shared";

export const useEmployees = (orgId: string) => {
  return useQuery<Employee[]>({
    queryKey: ["org", orgId, "employees"],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/employees`);
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};

export const useEmployee = (orgId: string, employeeId: string) => {
  return useQuery<Employee>({
    queryKey: ["org", orgId, "employees", employeeId],
    queryFn: async () => {
      const res = await clientFetch(`/organizations/${orgId}/employees/${employeeId}`);
      if (!res.ok) throw new Error("Failed to fetch employee");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
};
