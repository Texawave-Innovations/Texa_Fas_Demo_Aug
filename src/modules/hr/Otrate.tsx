import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Salary {
  grossMonthly?: number;
  monthlySalary?: number;
}

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  salary?: Salary;
}

import { getAllRecords } from '@/services/firebase';

export default function Otrate() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const savedMonth = localStorage.getItem('selectedPayrollMonth');
    if (savedMonth) return savedMonth;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const load = async () => {
      const emp = await getAllRecords('hr/employees');
      setEmployees(emp as Employee[]);
      setLoading(false);
    };
    load();
  }, []);

  const departments = [
    'All',
    ...Array.from(new Set(employees.map(e => e.department))).filter(Boolean),
  ];

  if (loading) {
    return <div className="p-8 text-center">Loading OT Rates…</div>;
  }

  const [yearStr, monthStr] = selectedMonth.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <h1 className="text-3xl font-bold">OT Rate</h1>
        <div className="flex items-center gap-4">
          <span className="text-lg font-medium text-gray-600">
            For Month: {selectedMonth}
          </span>
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="border px-3 py-2 rounded"
          >
            {departments.map(d => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left border-b font-medium">Name</th>
                <th className="p-3 text-left border-b font-medium">Emp ID</th>
                <th className="p-3 text-left border-b font-medium">Dept</th>
                <th className="p-3 text-right border-b font-medium">Monthly Salary</th>
                <th className="p-3 text-right border-b font-medium">Calculation</th>
                <th className="p-3 text-center border-b font-medium bg-blue-50">Calculated OT ₹/hr</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(
                  e =>
                    departmentFilter === 'All' ||
                    e.department === departmentFilter
                )
                .map(emp => {
                  const monthlySalary = emp.salary?.grossMonthly || emp.salary?.monthlySalary || 0;
                  const oneDaySalary = monthlySalary / daysInMonth;
                  const multiplier = (emp.department === 'Staff' || emp.department?.toLowerCase() === 'staff') ? 1 : 1.5;
                  const dynamicOtRate = Math.round((oneDaySalary / 8) * multiplier);

                  return (
                    <tr key={emp.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{emp.name}</td>
                      <td className="p-3">{emp.employeeId}</td>
                      <td className="p-3">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold leading-5 text-gray-800">
                          {emp.department}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        ₹{monthlySalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-3 text-right text-gray-500 text-xs">
                        {`(₹${monthlySalary.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / ${daysInMonth}) / 8 × ${multiplier}`}
                      </td>
                      <td className="p-3 text-center bg-blue-50 border-l font-bold text-blue-700">
                        ₹{dynamicOtRate.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
