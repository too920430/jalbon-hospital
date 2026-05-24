'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Reservation, Therapist, AuditLog, SmsLog } from '@/lib/types';
import { getAllReservations, getTherapists, updateReservationStatus, updateReservationDateTime, getSlotAvailability, deleteReservation, getAuditLogs, updatePatientPin, updateTherapistIncentive, insertAuditLog, deleteAuditLogs, getSmsLogs, deleteSmsLogs, getTherapistLeaves, insertTherapistLeave, updateTherapistLeave, deleteTherapistLeave } from '@/lib/api';
import { formatDate, formatTime, toDateStr, getAvailableSlots, isOpenDay, getOccupiedCountForSlot, getSlotError } from '@/lib/slots';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const STATUS_MAP = {
  pending:  { label: '승인 대기', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '예약 확정', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: '거절됨',   color: 'bg-red-100 text-red-600'      },
  done:     { label: '수납 대기', color: 'bg-blue-100 text-blue-600'  },
  paid:     { label: '수납/치료 완료', color: 'bg-slate-100 text-slate-600' },
  no_show:  { label: '노쇼 (예약부도)', color: 'bg-rose-100 text-rose-700' },
};

export default function AdminPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Existing state
  const [filterTherapist, setFilterTherapist] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateMode, setFilterDateMode] = useState<'month' | 'today' | 'all'>('today');
  const [listMonth, setListMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [listDate, setListDate] = useState(() => toDateStr(new Date()));


  // Edit modal state
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState<30 | 50>(50);
  const [editSaving, setEditSaving] = useState(false);
  const [editSlotAvailability, setEditSlotAvailability] = useState<{ id: string; start_time: string; duration: number }[]>([]);

  // Tabs & Dates
  const [adminTab, setAdminTab] = useState<'overview' | 'monthly' | 'yearly' | 'logs' | 'patients' | 'settlement' | 'sms' | 'leaves'>('overview');

  const downloadCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            cell = `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',')
      )
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedTherapistId, setSelectedTherapistId] = useState<string | null>(null);

  // Patients & Settlement Tab States
  const [patientSearch, setPatientSearch] = useState('');
  const [patientStatusFilter, setPatientStatusFilter] = useState<'all' | 'pending' | 'approved' | 'done' | 'paid'>('all');
  const [patientTypeFilter, setPatientTypeFilter] = useState<'all' | 'new' | 'existing'>('all');
  const [patientTherapistFilter, setPatientTherapistFilter] = useState<string>('all');
  const [viewingHistoryFor, setViewingHistoryFor] = useState<any>(null);
  const [historyMonth, setHistoryMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pinChangePatient, setPinChangePatient] = useState<{name: string, phone: string} | null>(null);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  
  // Log Delete Modal State
  const [logDeleteTarget, setLogDeleteTarget] = useState<{actionType?: string, label: string} | null>(null);
  const [logDeletePassword, setLogDeletePassword] = useState('');
  const [showLogDeletePassword, setShowLogDeletePassword] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [incentiveSaving, setIncentiveSaving] = useState<string | null>(null); // therapist_id
  const [editingIncentive, setEditingIncentive] = useState<{ id: string; amount: number } | null>(null);
  const [settlementDetails, setSettlementDetails] = useState<{ therapistName: string; res: Reservation[] } | null>(null);
  const [dailyStatsModal, setDailyStatsModal] = useState<{ date: string; reservations: Reservation[] } | null>(null);

  // Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'PATIENT_BOOKING' | 'THERAPIST_LOGIN' | 'RESERVATION_CANCELED'>('all');
  const [leaves, setLeaves] = useState<import('@/lib/types').TherapistLeave[]>([]);
  
  // 휴무 관리 폼 상태
  const [leaveTherapistId, setLeaveTherapistId] = useState<string>('');
  const [leaveDate, setLeaveDate] = useState(toDateStr(new Date()));
  const [leaveType, setLeaveType] = useState('연차');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveLoading, setLeaveLoading] = useState<string | null>(null);

  const [pickerType, setPickerType] = useState<'list' | 'monthly' | 'settlement' | null>(null);

  // 휴무 관리 달력 상태
  const [leavesCalYear, setLeavesCalYear] = useState(new Date().getFullYear());
  const [leavesCalMonth, setLeavesCalMonth] = useState(new Date().getMonth());
  const [editingLeave, setEditingLeave] = useState<import('@/lib/types').TherapistLeave | null>(null);
  const [editLeaveStart, setEditLeaveStart] = useState('');
  const [editLeaveEnd, setEditLeaveEnd] = useState('');
  const [editLeaveReason, setEditLeaveReason] = useState('');
  useEffect(() => {
    const role = sessionStorage.getItem('jalbon_role');
    if (role !== 'admin') {
      router.push('/therapist/login');
      return;
    }

    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [res, ths, logs, sms, lvs] = await Promise.all([getAllReservations(), getTherapists(), getAuditLogs(), getSmsLogs(), getTherapistLeaves()]);
    setReservations(res);
    setTherapists(ths);
    setAuditLogs(logs);
    setSmsLogs(sms);
    setLeaves(lvs);
    setLoading(false);
  };

  const handleDeleteLogsClick = () => {
    const actionType = logFilter === 'all' ? undefined : logFilter;
    const label = logFilter === 'all' ? '전체 로그' : {
      'PATIENT_BOOKING': '환자 예약',
      'THERAPIST_LOGIN': '치료사 로그인',
      'RESERVATION_CANCELED': '예약 취소',
      'TREATMENT_COMPLETED': '치료 완료',
      'PAYMENT_COMPLETED': '수납 확정'
    }[logFilter] as string;
    
    setLogDeleteTarget({ actionType, label });
    setLogDeletePassword('');
    setShowLogDeletePassword(false);
  };

  const confirmLogDelete = async () => {
    if (!logDeleteTarget) return;
    if (logDeletePassword !== 'wkfqhs2022!@#') {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    if (logDeleteTarget.type === 'sms') {
      const success = await deleteSmsLogs();
      if (success) {
        alert('알림 내역이 삭제되었습니다.');
        setLogDeleteTarget(null);
        await loadData();
      } else {
        alert('알림 내역 삭제 중 오류가 발생했습니다.');
      }
      return;
    }

    const success = await deleteAuditLogs(logDeleteTarget.actionType);
    if (success) {
      alert('삭제되었습니다.');
      setLogDeleteTarget(null);
      await loadData();
    } else {
      alert('로그 삭제 중 오류가 발생했습니다. 권한을 확인해주세요.');
    }
  };


  const logout = () => {
    sessionStorage.clear();
    router.push('/therapist/login');
  };

  const startEdit = (res: Reservation) => {
    setEditingRes(res);
    setEditDate(res.date);
    setEditTime(res.start_time.slice(0, 5));
    setEditDuration(res.duration);
    getSlotAvailability(res.date, res.therapist_id || null).then(setEditSlotAvailability);
  };

  const handleAdminEditDateChange = (date: string) => {
    setEditDate(date);
    setEditTime('');
    if (date && editingRes) getSlotAvailability(date, editingRes.therapist_id || null).then(setEditSlotAvailability);
  };

  const handleAdminEditDurationChange = (dur: 30 | 50) => {
    setEditDuration(dur);
    setEditTime('');
  };

  const handleEditSave = async () => {
    if (!editingRes || !editDate || !editTime) return;
    setEditSaving(true);
    const time = editTime.length === 5 ? editTime + ':00' : editTime;
    await updateReservationDateTime(editingRes.id, editDate, time, editDuration);
    await loadData();
    setEditingRes(null);
    setEditSaving(false);
  };

  const handleAdminDelete = async () => {
    if (!editingRes) return;
    if (!confirm('정말로 이 예약을 삭제하시겠습니까? (삭제 후 복구할 수 없습니다)')) return;
    setEditSaving(true);
    const result = await deleteReservation(editingRes.id, '관리자');
    if (!result.success) {
      alert('예약 삭제에 실패했습니다.\nSupabase 대시보드에서 DELETE 권한(policy) 설정이 필요합니다.');
    } else {
      await loadData();
      setEditingRes(null);
    }
    setEditSaving(false);
  };

  const handlePinReset = async () => {
    if (!pinChangePatient || !newPin || newPin.length !== 4) {
      alert('새로운 4자리 PIN을 입력해주세요.');
      return;
    }
    setPinSaving(true);
    const res = await updatePatientPin(pinChangePatient.phone, newPin);
    setPinSaving(false);
    if (res.success) {
      alert('비밀번호가 성공적으로 변경되었습니다.');
      setPinChangePatient(null);
      setNewPin('');
      loadData();
    } else {
      alert('비밀번호 변경 실패: ' + res.error);
    }
  };

  const handleIncentiveSave = async () => {
    if (!editingIncentive) return;
    setIncentiveSaving(editingIncentive.id);
    const res = await updateTherapistIncentive(editingIncentive.id, editingIncentive.amount);
    setIncentiveSaving(null);
    if (res.success) {
      setEditingIncentive(null);
      loadData();
    } else {
      alert('인센티브 수정 실패: ' + res.error);
    }
  };

  // --- Overview Data ---
  const today = toDateStr(new Date());
  const todayAll = reservations.filter((r) => r.date === today);
  const allDone = reservations.filter((r) => r.status === 'done').length;

  const currentMonthString = today.slice(0, 7);
  const thisMonthReservations = reservations.filter((r) => r.date.startsWith(currentMonthString));

  const therapistStats = therapists.map((t) => ({
    therapist: t,
    thisMonth: thisMonthReservations.filter((r) => r.therapist_id === t.id).length,
    total: reservations.filter((r) => r.therapist_id === t.id).length,
  }));

  const filtered = reservations.filter((r) => {
    if (filterDateMode === 'month' && !r.date.startsWith(listMonth)) return false;
    if (filterDateMode === 'today' && r.date !== listDate) return false;
    if (filterTherapist && r.therapist_id !== filterTherapist) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  // --- Monthly Data ---
  const calYear = currentMonth.getFullYear();
  const calMonth = currentMonth.getMonth();
  const selectedMonthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const monthlyReservations = reservations.filter(r => r.date.startsWith(selectedMonthStr));

  const monthlyTherapistStats = therapists.map((t) => {
    const tRes = monthlyReservations.filter((r) => r.therapist_id === t.id && r.status !== 'rejected');
    
    // Calculate new vs existing for this month
    let newCount = 0;
    let existCount = 0;

    tRes.forEach(r => {
      const pastPaid = reservations.filter(
        past => past.patient_phone === r.patient_phone && 
                past.status !== 'rejected' && 
                (past.date + ' ' + past.start_time) < (r.date + ' ' + r.start_time)
      );
      if (pastPaid.length > 0) existCount++;
      else newCount++;
    });

    return {
      therapist: t,
      count: tRes.length,
      newCount,
      existCount
    };
  });

  const prevMonth = () => setCurrentMonth(new Date(calYear, calMonth - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(calYear, calMonth + 1, 1));

  const handleListMonthPrev = () => {
    const [y, m] = listMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setListMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setFilterDateMode('month');
  };
  const handleListMonthNext = () => {
    const [y, m] = listMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setListMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setFilterDateMode('month');
  };

  const handleSettlementMonthPrev = () => {
    const [y, m] = settlementMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setSettlementMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const handleSettlementMonthNext = () => {
    const [y, m] = settlementMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setSettlementMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  // --- Yearly Data ---
  const prevYear = () => setCurrentYear(y => y - 1);
  const nextYear = () => setCurrentYear(y => y + 1);

  const yearlyReservations = reservations.filter(r => r.date.startsWith(String(currentYear)));
  const yearlyTherapistStats = therapists.map((t) => {
    const tRes = yearlyReservations.filter(r => r.therapist_id === t.id && r.status === 'paid');
    const months = Array.from({length: 12}).map((_, i) => {
      const mStr = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
      return tRes.filter(r => r.date.startsWith(mStr)).length;
    });
    return { therapist: t, months, total: tRes.length };
  });


  // --- Patients Data ---
  const patientGroups = reservations.reduce((acc, r) => {
    const key = `${r.patient_phone}::${r.patient_name}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {} as Record<string, Reservation[]>);

  const patientsList = Object.entries(patientGroups).map(([key, resList]) => {
    const [phone, name] = key.split('::');
    const sorted = [...resList].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sorted[0];
    const totalCount = resList.length;
    const paidCount = resList.filter(r => r.status === 'paid' || r.status === 'done').length;
    const cancelCount = resList.filter(r => r.status === 'rejected').length;
    const noShowCount = resList.filter(r => r.status === 'no_show').length;
    
    // 주 담당 치료사 계산 (수납대기/수납완료 건수만 기준, 최신순 우선)
    const validRes = sorted.filter(r => r.status === 'paid' || r.status === 'done');
    const thCounts = validRes.reduce((acc, r) => {
      if (r.therapist_id) acc[r.therapist_id] = (acc[r.therapist_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    let mainTherapistId = null;
    let maxCount = 0;
    for (const [tid, c] of Object.entries(thCounts)) {
      if (c > maxCount) { maxCount = c; mainTherapistId = tid; }
    }
    const mainTherapist = therapists.find(t => t.id === mainTherapistId);

    return {
      name,
      phone,
      totalCount,
      paidCount,
      cancelCount,
      noShowCount,
      latestDate: latest.date,
      latestStatus: latest.status,
      allVisits: resList.filter(r => r.status === 'paid' || r.status === 'done').sort((a, b) => new Date(b.date + ' ' + b.start_time).getTime() - new Date(a.date + ' ' + a.start_time).getTime()),
      mainTherapist: mainTherapist ? mainTherapist.name : '없음',
      isNew: paidCount <= 1
    };
  }).filter(p => !patientSearch || p.name.includes(patientSearch) || p.phone.includes(patientSearch))
    .filter(p => patientStatusFilter === 'all' || p.latestStatus === patientStatusFilter)
    .filter(p => patientTypeFilter === 'all' || (patientTypeFilter === 'new' ? p.isNew : !p.isNew))
    .filter(p => patientTherapistFilter === 'all' || p.mainTherapist === patientTherapistFilter)
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate));

  // --- Settlement Data ---
  const [calSettlementYear, calSettlementMonth] = settlementMonth.split('-').map(Number);
  const selectedSettlementMonthStr = `${calSettlementYear}-${String(calSettlementMonth).padStart(2, '0')}`;
  const settlementReservations = reservations.filter(r => r.date.startsWith(selectedSettlementMonthStr));

  const settlementStats = therapists.map(t => {
    const tRes = settlementReservations.filter(r => r.therapist_id === t.id && r.status === 'paid');
    const incentiveAmount = t.incentive || 10000;
    const totalPreTax = tRes.length * incentiveAmount;
    const tax = Math.floor(totalPreTax * 0.033);
    const totalPostTax = totalPreTax - tax;
    
    return {
      therapist: t,
      resList: tRes,
      count: tRes.length,
      incentiveAmount,
      totalPreTax,
      tax,
      totalPostTax
    };
  });

  return (
    <div className="min-h-screen bg-[#F0F9FF]">

      {/* 날짜/시간 수정 모달 */}
      {editingRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 overflow-y-auto py-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in-up my-auto">
            <div>
              <h2 className="font-bold text-slate-800 text-lg">📅 예약 날짜/시간 변경</h2>
              <p className="text-sm text-slate-500 mt-1">
                {editingRes.patient_name} · {editingRes.patient_phone}
              </p>
            </div>
            <div className="space-y-3">
              {/* 날짜 + 치료시간 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-semibold text-slate-600 mb-1.5 block">날짜</label>
                  <input
                    type="date"
                    className="input-field"
                    value={editDate}
                    onChange={(e) => handleAdminEditDateChange(e.target.value)}
                  />
                </div>
                <div className="w-28">
                  <label className="text-sm font-semibold text-slate-600 mb-1.5 block">치료 시간</label>
                  <select
                    className="input-field"
                    value={editDuration}
                    onChange={(e) => handleAdminEditDurationChange(Number(e.target.value) as 30 | 50)}
                  >
                    <option value={30}>30분</option>
                    <option value={50}>50분</option>
                  </select>
                </div>
              </div>

              {/* 시간 슬롯 그리드 */}
              {editDate && (() => {
                const dateObj = new Date(editDate + 'T00:00:00');
                const slots = getAvailableSlots(dateObj, editDuration);
                const activeTherapistsCount = therapists.length || 1;
                if (!isOpenDay(dateObj)) return (
                  <p className="text-xs text-red-400 text-center py-2">해당 날짜는 휴무입니다</p>
                );
                if (slots.length === 0) return (
                  <p className="text-xs text-slate-400 text-center py-2">예약 가능한 시간이 없습니다</p>
                );
                const amSlots = slots.filter(t => parseInt(t.split(':')[0]) < 12);
                const pmSlots = slots.filter(t => parseInt(t.split(':')[0]) >= 12);
                return (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600 block">시작 시간 선택</label>
                    {amSlots.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">오전</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {amSlots.map(time => {
                            const err = getSlotError(time, editDuration, dateObj);
                            const count = getOccupiedCountForSlot(time, editDuration, editSlotAvailability, editingRes.id);
                            const limit = editingRes.therapist_id ? 1 : activeTherapistsCount;
                            const isFull = count >= limit;
                            const isSelected = editTime === time;
                            const isDisabled = isFull || err !== null;
                            return (
                              <button key={time} disabled={isDisabled}
                                onClick={() => !isDisabled && setEditTime(time)}
                                className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                  isSelected ? 'bg-sky-500 text-white shadow-sm'
                                  : isDisabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-slate-50 border border-sky-200 text-slate-700 hover:bg-sky-50'
                                }`}>
                                {formatTime(time)}
                                {isDisabled && !isSelected && <div className="text-[9px] leading-tight break-keep">{err || '마감'}</div>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {pmSlots.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">오후</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {pmSlots.map(time => {
                            const err = getSlotError(time, editDuration, dateObj);
                            const count = getOccupiedCountForSlot(time, editDuration, editSlotAvailability, editingRes.id);
                            const limit = editingRes.therapist_id ? 1 : activeTherapistsCount;
                            const isFull = count >= limit;
                            const isSelected = editTime === time;
                            const isDisabled = isFull || err !== null;
                            return (
                              <React.Fragment key={time}>
                                <button disabled={isDisabled}
                                  onClick={() => !isDisabled && setEditTime(time)}
                                  className={`py-1.5 rounded-xl text-xs font-semibold transition-all ${
                                    isSelected ? 'bg-sky-500 text-white shadow-sm'
                                    : isDisabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                    : 'bg-slate-50 border border-sky-200 text-slate-700 hover:bg-sky-50'
                                  }`}>
                                  {formatTime(time)}
                                  {isDisabled && !isSelected && <div className="text-[9px] leading-tight break-keep">{err || '마감'}</div>}
                                </button>
                                {time === '12:00' && dateObj.getDay() !== 6 && (
                                  <div className="col-span-2 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-xs font-medium">
                                    점심시간 12:30 ~ 1:30
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* 범례 */}
                    <div className="flex gap-3 text-[10px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-slate-50 border border-sky-200" /> 예약 가능
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-sky-500" /> 선택됨
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-slate-100" /> 마감
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleEditSave}
                disabled={editSaving || !editDate || !editTime}
                className="btn-primary flex-1 text-sm py-2"
              >
                {editSaving ? '저장 중...' : '✓ 저장'}
              </button>
              <button
                onClick={handleAdminDelete}
                disabled={editSaving}
                className="bg-red-50 text-red-600 hover:bg-red-100 font-semibold rounded-xl flex-1 text-sm py-2 transition-colors border border-red-200"
              >
                🗑 삭제
              </button>
              <button
                onClick={() => setEditingRes(null)}
                className="btn-secondary flex-1 text-sm py-2"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="page-header">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700
                            flex items-center justify-center text-white text-lg">
              ⚙️
            </div>
            <div>
              <h1 className="font-bold text-slate-800">관리자 대시보드</h1>
              <p className="text-xs text-slate-400">창원 본앤밸런스 도수치료실</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="text-xs text-sky-500 font-semibold px-3 py-1.5 rounded-xl border border-sky-200 hover:bg-sky-50 transition-colors">
              환자화면
            </Link>
            <button id="admin-logout" onClick={logout}
                    className="text-xs text-slate-500 font-semibold px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* Tab Controls */}
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setAdminTab('overview')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'overview' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            대시보드 요약
          </button>
          <button
            onClick={() => setAdminTab('monthly')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'monthly' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            월간 치료사 통계
          </button>
          <button
            onClick={() => setAdminTab('yearly')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'yearly' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            연간 치료사 통계
          </button>
          <button
            onClick={() => setAdminTab('patients')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'patients' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            환자 관리
          </button>
          <button
            onClick={() => setAdminTab('settlement')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'settlement' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            정산 관리
          </button>
          <button
            onClick={() => setAdminTab('sms')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'sms' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            알리고 알림내역
          </button>
          <button
            onClick={() => setAdminTab('leaves')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'leaves' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            휴무 관리
          </button>
          <button
            onClick={() => setAdminTab('logs')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all min-w-[120px]
              ${adminTab === 'logs' ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            전체 로그
          </button>
        </div>

        {/* =========================================================================
            TAB: OVERVIEW
            ========================================================================= */}
        {adminTab === 'overview' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Overview stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="오늘 예약" value={todayAll.length} color="text-sky-600" 
                isActive={filterDateMode === 'today' && filterStatus === ''}
                onClick={() => { setFilterDateMode('today'); setFilterStatus(''); setFilterTherapist(''); }} />
              <StatCard label="수납 대기" value={allDone} color="text-amber-600" highlight={allDone > 0} 
                isActive={filterStatus === 'done'}
                onClick={() => { setFilterDateMode('all'); setFilterStatus('done'); setFilterTherapist(''); }} />
              <StatCard label="이번달 예약" value={thisMonthReservations.length} color="text-slate-700" 
                isActive={filterDateMode === 'month' && filterStatus === ''}
                onClick={() => { setFilterDateMode('month'); setFilterStatus(''); setFilterTherapist(''); }} />
            </div>

            {/* Therapist stats (This Month) */}
            <div className="card">
              <h2 className="font-bold text-slate-700 mb-3">치료사별 현황 (이번 달)</h2>
              <p className="text-xs text-slate-500 mb-4">치료사를 클릭하여 해당 치료사의 예약만 필터링하거나 더블 클릭하여 전체 리스트로 돌아갈 수 있습니다.</p>
              
              <div className="mb-6 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={therapistStats.filter(t => t.thisMonth > 0)}
                      dataKey="thisMonth"
                      nameKey="therapist.name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                    >
                      {therapistStats.filter(t => t.thisMonth > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.therapist.color || '#94a3b8'} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {therapistStats.map(({ therapist: t, thisMonth, total }) => (
                  <div key={t.id} 
                       onClick={() => { setFilterTherapist(t.id); setFilterDateMode('month'); setFilterStatus(''); setListMonth(currentMonthString); }}
                       onDoubleClick={() => setFilterTherapist('')}
                       className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors border ${filterTherapist === t.id ? 'border-sky-400 bg-sky-50 shadow-sm' : 'border-transparent bg-slate-50 hover:bg-slate-100'}`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                         style={{ backgroundColor: t.color }}>
                      {t.name[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">{t.name}</p>
                      <p className="text-xs text-slate-500">이번 달 <strong className="text-sky-600">{thisMonth}</strong>건 · 전체 {total}건</p>
                    </div>
                  </div>
                ))}
                {(() => {
                  const unassignedThisMonth = thisMonthReservations.filter(r => r.therapist_id === null).length;
                  const unassignedTotal = reservations.filter(r => r.therapist_id === null).length;
                  if (unassignedTotal > 0) {
                    return (
                      <div key="unassigned" className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold bg-slate-400">?</div>
                        <div>
                          <p className="font-semibold text-slate-700 text-sm">치료사 미정</p>
                          <p className="text-xs text-slate-500">이번 달 <strong className="text-sky-600">{unassignedThisMonth}</strong>건 · 전체 {unassignedTotal}건</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Reservation List */}
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                {filterDateMode === 'today' ? (
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-2xl border border-slate-100">
                    <button onClick={() => {
                      const d = new Date(listDate);
                      d.setDate(d.getDate() - 1);
                      setListDate(toDateStr(d));
                    }} className="text-slate-400 hover:text-sky-500 font-bold transition-colors text-lg">◀</button>
                    <div className="relative flex items-center justify-center cursor-pointer hover:text-sky-600 transition-colors w-24">
                      <h2 className="font-extrabold text-slate-700 text-center text-sm pointer-events-none">
                        {listDate.split('-')[0]}.{listDate.split('-')[1]}.{listDate.split('-')[2]}
                      </h2>
                      <input 
                        type="date" 
                        value={listDate} 
                        onChange={(e) => setListDate(e.target.value)}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker(); } catch(e) {} }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                    </div>
                    <button onClick={() => {
                      const d = new Date(listDate);
                      d.setDate(d.getDate() + 1);
                      setListDate(toDateStr(d));
                    }} className="text-slate-400 hover:text-sky-500 font-bold transition-colors text-lg">▶</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-slate-50 px-4 py-1.5 rounded-2xl border border-slate-100">
                    <button onClick={handleListMonthPrev} className="text-slate-400 hover:text-sky-500 font-bold transition-colors text-lg">◀</button>
                    <div 
                      className="relative flex items-center justify-center cursor-pointer hover:text-sky-600 transition-colors"
                      onClick={() => setPickerType('list')}
                    >
                      <h2 className="font-extrabold text-slate-700 min-w-[90px] text-center text-sm">
                        {listMonth.split('-')[0]}년 {listMonth.split('-')[1]}월
                      </h2>
                    </div>
                    <button onClick={handleListMonthNext} className="text-slate-400 hover:text-sky-500 font-bold transition-colors text-lg">▶</button>
                  </div>
                )}
                <div className="flex gap-2">
                  <select id="filter-therapist" className="input-field w-auto text-sm py-2"
                          value={filterTherapist} onChange={(e) => setFilterTherapist(e.target.value)}>
                    <option value="">전체 치료사</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <select id="filter-status" className="input-field w-auto text-sm py-2"
                          value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="">전체 상태</option>
                    <option value="pending">승인 대기</option>
                    <option value="approved">예약 확정</option>
                    <option value="rejected">거절됨</option>
                    <option value="done">수납 대기</option>
                    <option value="paid">수납/치료 완료</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-400 animate-pulse-soft">불러오는 중...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-slate-400 text-sm">이번 달 예약이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-6 py-2 w-16 text-center">No.</th>
                        <th className="px-2 py-2">날짜 · 시간</th>
                        <th className="px-4 py-2">환자</th>
                        <th className="px-4 py-2">치료사</th>
                        <th className="px-4 py-2">시간</th>
                        <th className="px-4 py-2">상태</th>
                        <th className="px-4 py-2">수정</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filtered
                        .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
                        .map((res, idx) => {
                          const statusInfo = STATUS_MAP[res.status];
                          const th = therapists.find((t) => t.id === res.therapist_id);
                          return (
                            <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3 text-center font-bold text-slate-400">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-3">
                                <p className="font-semibold text-slate-700">{formatDate(res.date)}</p>
                                <p className="text-slate-400 text-xs">{formatTime(res.start_time)}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-slate-700">{res.patient_name}</p>
                                <p className="text-slate-400 text-xs">{res.patient_phone}</p>
                                {res.pin && <p className="text-slate-400 text-xs mt-0.5">PIN: {res.pin}</p>}
                              </td>
                              <td className="px-4 py-3">
                                {th ? (
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: th.color }} />
                                    {th.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">미정</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{res.duration}분</td>
                              <td className="px-4 py-3">
                                <span className={`status-badge ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => startEdit(res)}
                                    className="text-xs text-sky-600 font-semibold px-2 py-1 rounded-lg border border-sky-200 hover:bg-sky-50 transition-colors"
                                  >
                                    📅 수정
                                  </button>
                                  {(res.status === 'pending' || res.status === 'approved') && (
                                    <button
                                      onClick={() => {
                                        if (confirm('이 예약을 노쇼 처리하시겠습니까?')) {
                                          updateReservationStatus(res.id, 'no_show').then(success => {
                                            if (success) loadData();
                                            else alert('상태 변경 중 오류가 발생했습니다.');
                                          });
                                        }
                                      }}
                                      className="text-xs text-rose-600 font-semibold px-2 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 transition-colors"
                                    >
                                      노쇼
                                    </button>
                                  )}
                                  {res.status === 'done' && (
                                    <button
                                      onClick={async () => {
                                        if (confirm('이 예약의 수납을 확인하셨습니까? (통계에 반영됩니다)')) {
                                          await updateReservationStatus(res.id, 'paid');
                                          await insertAuditLog('PAYMENT_COMPLETED', '관리자', {
                                            patientName: res.patient_name,
                                            date: res.date,
                                            time: res.start_time
                                          });
                                          await loadData();
                                        }
                                      }}
                                      className="text-xs text-white bg-blue-500 font-semibold px-2 py-1 rounded-lg hover:bg-blue-600 transition-colors"
                                    >
                                      수납 확인
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: MONTHLY
            ========================================================================= */}
        {adminTab === 'monthly' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="card flex items-center justify-between px-6 flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button onClick={prevMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors text-xl">◀</button>
                <h2 
                  className="font-extrabold text-2xl text-slate-700 cursor-pointer hover:text-sky-600 transition-colors"
                  onClick={() => setPickerType('monthly')}
                >
                  {calYear}년 {calMonth + 1}월
                </h2>
                <button onClick={nextMonth} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors text-xl">▶</button>
              </div>
              <button onClick={() => {
                let dataToExport: any[] = [];
                if (selectedTherapistId && selectedTherapistId !== 'unassigned') {
                  const th = therapists.find(t => t.id === selectedTherapistId);
                  const thRes = monthlyReservations.filter(r => r.therapist_id === selectedTherapistId && r.status !== 'rejected');
                  dataToExport = thRes.sort((a,b) => (a.date+a.start_time).localeCompare(b.date+b.start_time)).map((r, i) => ({
                    'No': i + 1,
                    '치료사': th?.name || '',
                    '환자명': r.patient_name,
                    '전화번호': r.patient_phone,
                    '날짜': r.date,
                    '시간': r.start_time.slice(0,5),
                    '상태': STATUS_MAP[r.status]?.label || r.status,
                    '비고': r.note || ''
                  }));
                } else {
                  const allRes = monthlyReservations.filter(r => r.status !== 'rejected');
                  dataToExport = allRes.sort((a,b) => (a.date+a.start_time).localeCompare(b.date+b.start_time)).map((r, i) => {
                    const th = therapists.find(t => t.id === r.therapist_id);
                    return {
                      'No': i + 1,
                      '치료사': th?.name || '미정',
                      '환자명': r.patient_name,
                      '전화번호': r.patient_phone,
                      '날짜': r.date,
                      '시간': r.start_time.slice(0,5),
                      '상태': STATUS_MAP[r.status]?.label || r.status,
                      '비고': r.note || ''
                    };
                  });
                }
                downloadCSV(dataToExport, `월간치료사통계_${calYear}년${calMonth+1}월`);
              }} className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 font-bold px-4 rounded-xl text-sm transition-colors h-[42px]">
                📥 엑셀 다운로드
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {monthlyTherapistStats.map(({ therapist: t, count, newCount, existCount }) => {
                const isSelected = selectedTherapistId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTherapistId(isSelected ? null : t.id)}
                    className={`card text-center py-4 cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-sky-400 shadow-md bg-sky-50' : 'hover:border-sky-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-white font-bold mb-2 shadow-sm"
                         style={{ backgroundColor: t.color }}>
                      {t.name[0]}
                    </div>
                    <p className="font-semibold text-slate-700 text-sm">{t.name}</p>
                    <p className="text-sky-600 font-bold mt-1 text-lg">{count}<span className="text-xs text-slate-400 font-normal ml-0.5">건</span></p>
                    <div className="mt-2 text-[10px] text-slate-500 flex justify-center gap-2">
                      <span className="bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">신환: {newCount}</span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded">재진: {existCount}</span>
                    </div>
                  </div>
                );
              })}
              {(() => {
                const unassignedCount = monthlyReservations.filter(r => r.therapist_id === null).length;
                if (unassignedCount > 0) {
                  return (
                    <div
                      key="unassigned"
                      onClick={() => setSelectedTherapistId('unassigned')}
                      className={`p-4 rounded-2xl border text-center transition-all cursor-pointer ${
                        selectedTherapistId === 'unassigned' ? 'border-sky-400 bg-sky-50 shadow-md ring-2 ring-sky-100' : 'border-slate-100 bg-white hover:border-sky-200'
                      }`}
                    >
                      <div className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center text-white font-bold mb-2 shadow-sm bg-slate-400">?</div>
                      <p className="font-semibold text-slate-700 text-sm">치료사 미정</p>
                      <p className="text-sky-600 font-bold mt-1 text-lg">{unassignedCount}<span className="text-xs text-slate-400 font-normal ml-0.5">건</span></p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Monthly Trend Chart */}
            <div className="card p-4">
              <h3 className="font-bold text-slate-700 mb-4">월간 예약 추이</h3>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={days.filter(d => d !== null).map(day => {
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      let dayRes = monthlyReservations.filter(r => r.date === dateStr && r.status !== 'rejected');
                      if (selectedTherapistId) {
                        dayRes = selectedTherapistId === 'unassigned' 
                          ? dayRes.filter(r => r.therapist_id === null)
                          : dayRes.filter(r => r.therapist_id === selectedTherapistId);
                      }
                      return {
                        day: `${day}일`,
                        건수: dayRes.length,
                        신환: dayRes.filter(r => reservations.filter(past => past.patient_phone === r.patient_phone && past.status !== 'rejected' && (past.date + ' ' + past.start_time) < (r.date + ' ' + r.start_time)).length === 0).length,
                        재진: dayRes.filter(r => reservations.filter(past => past.patient_phone === r.patient_phone && past.status !== 'rejected' && (past.date + ' ' + past.start_time) < (r.date + ' ' + r.start_time)).length > 0).length
                      };
                    })}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line type="monotone" dataKey="건수" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-700">
                  일별 예약 현황
                  {selectedTherapistId && (
                    <span className="ml-2 text-sm font-medium text-sky-600">
                      ({selectedTherapistId === 'unassigned' ? '미정' : therapists.find(t => t.id === selectedTherapistId)?.name} 치료사 기준)
                    </span>
                  )}
                  {!selectedTherapistId && (
                    <span className="ml-2 text-sm font-medium text-slate-400">
                      (전체 합산)
                    </span>
                  )}
                </h3>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-semibold text-slate-400">
                <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-sky-400">토</div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} className="h-20 rounded-xl bg-slate-50/50" />;
                  
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  let dayRes = monthlyReservations.filter(r => r.date === dateStr && r.status !== 'rejected');
                  if (selectedTherapistId) {
                    if (selectedTherapistId === 'unassigned') {
                      dayRes = dayRes.filter(r => r.therapist_id === null);
                    } else {
                      dayRes = dayRes.filter(r => r.therapist_id === selectedTherapistId);
                    }
                  }

                  const count = dayRes.length;
                  const isToday = dateStr === today;

                  return (
                    <div
                      key={day}
                      className={`h-20 rounded-xl border flex flex-col p-1.5 transition-all ${
                        isToday ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <span className={`text-xs font-semibold ${isToday ? 'text-sky-600' : 'text-slate-500'}`}>{day}</span>
                      {count > 0 && (
                        <div 
                          onClick={() => setDailyStatsModal({ date: dateStr, reservations: dayRes })}
                          className="mt-auto self-center bg-sky-100 hover:bg-sky-200 text-sky-700 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm cursor-pointer transition-colors"
                        >
                          {count}건
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 text-center mt-4">
                치료사 카드를 클릭하면 해당 치료사의 일자별 건수만 확인할 수 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: YEARLY
            ========================================================================= */}
        {adminTab === 'yearly' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="card flex items-center justify-between px-6">
              <button onClick={prevYear} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">◀</button>
              <h2 className="font-extrabold text-2xl text-slate-700">{currentYear}년</h2>
              <button onClick={nextYear} className="text-slate-400 hover:text-sky-500 p-2 font-bold transition-colors">▶</button>
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">치료사별 월별 세부 통계</h3>
                <p className="text-xs text-slate-500 mt-1">각 월별 예약 건수와 연간 총합을 확인할 수 있습니다.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px] text-center">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="py-3 px-4 text-left font-semibold w-40">치료사</th>
                      {Array.from({length: 12}).map((_, i) => (
                        <th key={i} className="py-3 w-10 font-semibold">{i+1}월</th>
                      ))}
                      <th className="py-3 px-4 text-sky-600 font-bold w-20">합계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearlyTherapistStats.map(stat => (
                      <tr key={stat.therapist.id} className="hover:bg-sky-50/50 transition-colors">
                        <td className="py-3 px-4 text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
                                 style={{backgroundColor: stat.therapist.color}}>
                              {stat.therapist.name[0]}
                            </div>
                            <span className="font-bold text-slate-700">{stat.therapist.name}</span>
                          </div>
                        </td>
                        {stat.months.map((mCount, i) => (
                          <td key={i} className={`py-3 ${mCount > 0 ? 'text-slate-800 font-bold' : 'text-slate-300'}`}>
                            {mCount > 0 ? mCount : '-'}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-sky-600 font-extrabold text-lg">
                          {stat.total}
                        </td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-slate-50 font-bold text-slate-700">
                      <td className="py-3 px-4 text-left">총계 (전체)</td>
                      {Array.from({length: 12}).map((_, i) => {
                        const monthTotal = yearlyTherapistStats.reduce((sum, stat) => sum + stat.months[i], 0);
                        return (
                          <td key={i} className="py-3 text-slate-600">
                            {monthTotal > 0 ? monthTotal : '-'}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 text-sky-600 font-extrabold text-xl">
                        {yearlyTherapistStats.reduce((sum, stat) => sum + stat.total, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB: LOGS
            ========================================================================= */}
        {adminTab === 'logs' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h2 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                  <span>전체 로그 기록</span>
                  <span className="bg-sky-100 text-sky-600 text-xs px-2 py-0.5 rounded-full">{auditLogs.length}건</span>
                </h2>
                <div className="flex bg-slate-50 p-1 rounded-xl gap-1 overflow-x-auto">
                  {[
                    { id: 'all', label: '전체보기' },
                    { id: 'PATIENT_BOOKING', label: '환자 예약' },
                    { id: 'THERAPIST_LOGIN', label: '치료사 로그인' },
                    { id: 'RESERVATION_CANCELED', label: '예약 취소' },
                    { id: 'TREATMENT_COMPLETED', label: '치료 완료' },
                    { id: 'PAYMENT_COMPLETED', label: '수납 확정' },
                    { id: 'RESERVATION_APPROVED', label: '예약 승인' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setLogFilter(f.id as any)}
                      className={`whitespace-nowrap px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        logFilter === f.id ? 'bg-white text-sky-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-end px-2">
                <button
                  onClick={handleDeleteLogsClick}
                  className="text-xs px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors flex items-center gap-1"
                >
                  🗑 현재 필터 로그 삭제
                </button>
              </div>
              
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {(() => {
                  const filteredLogs = auditLogs.filter(log => logFilter === 'all' || log.action_type === logFilter);
                  if (filteredLogs.length === 0) {
                    return <p className="text-center text-slate-400 py-8 text-sm">해당하는 로그 기록이 없습니다.</p>;
                  }
                  return filteredLogs.map((log) => {
                    const date = new Date(log.created_at);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                    
                    let icon = '📝';
                    let bgColor = 'bg-slate-50';
                    let title = '';
                    let desc = '';
                    
                    if (log.action_type === 'PATIENT_BOOKING') {
                      icon = '📅';
                      bgColor = 'bg-sky-50';
                      title = '환자 예약 접수';
                      desc = `${log.actor_name} 환자님이 ${log.details?.date || ''} ${log.details?.time?.slice(0,5) || ''} 예약을 접수했습니다.`;
                    } else if (log.action_type === 'THERAPIST_LOGIN') {
                      icon = '🔑';
                      bgColor = 'bg-emerald-50';
                      title = '치료사 로그인';
                      desc = `${log.actor_name}님이 시스템에 로그인했습니다.`;
                    } else if (log.action_type === 'RESERVATION_CANCELED') {
                      icon = '🗑';
                      bgColor = 'bg-red-50';
                      title = '예약 취소 (거절/삭제)';
                      desc = `${log.actor_name}님이 ${log.details?.patientName || ''} 환자의 예약(${log.details?.date || ''} ${log.details?.time?.slice(0,5) || ''})을 취소했습니다. (사유: ${log.details?.reason || ''})`;
                    } else if (log.action_type === 'TREATMENT_COMPLETED') {
                      icon = '✅';
                      bgColor = 'bg-blue-50';
                      title = '치료 완료 (수납 대기)';
                      desc = `${log.actor_name}님이 ${log.details?.patientName || ''} 환자의 예약(${log.details?.date || ''} ${log.details?.time?.slice(0,5) || ''})을 치료 완료 처리했습니다.`;
                    } else if (log.action_type === 'PAYMENT_COMPLETED') {
                      icon = '💰';
                      bgColor = 'bg-indigo-50';
                      title = '수납 및 최종 완료';
                      desc = `${log.actor_name}님이 ${log.details?.patientName || ''} 환자의 예약(${log.details?.date || ''} ${log.details?.time?.slice(0,5) || ''})을 최종 수납 처리했습니다.`;
                    } else if (log.action_type === 'RESERVATION_APPROVED') {
                      icon = '👍';
                      bgColor = 'bg-amber-50';
                      title = '예약 승인 확정';
                      desc = `${log.actor_name}님이 ${log.details?.patientName || ''} 환자의 예약(${log.details?.date || ''} ${log.details?.time?.slice(0,5) || ''})을 승인 확정 처리했습니다.`;
                    }
                    
                    return (
                      <div key={log.id} className={`flex items-start gap-4 p-4 rounded-2xl ${bgColor} border border-slate-100 transition-all hover:shadow-sm`}>
                        <div className="text-2xl mt-1 bg-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm">{icon}</div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
                            <span className="text-[10px] text-slate-400 font-medium bg-white px-2 py-0.5 rounded-full border border-slate-100 whitespace-nowrap">{dateStr}</span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium break-keep leading-relaxed">{desc}</p>
                          {(log.details?.ip || log.details?.userAgent) && (
                            <div className="mt-2 text-[10px] text-slate-400 bg-white p-2 rounded border border-slate-100 flex flex-col gap-0.5">
                              {log.details.ip && <span><strong className="text-slate-500">IP:</strong> {log.details.ip}</span>}
                              {log.details.userAgent && <span className="truncate"><strong className="text-slate-500">기기:</strong> {log.details.userAgent}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            탭 5: 환자 관리
        ========================================================================= */}
        {adminTab === 'patients' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-end flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">환자 관리</h2>
                <p className="text-sm text-slate-500">총 {patientsList.length}명의 환자가 방문했습니다.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="이름 또는 전화번호 검색"
                  className="input-field max-w-[200px]"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                      <th className="p-4 font-semibold text-center w-12">No.</th>
                      <th className="p-4 font-semibold">환자명 (전화번호)</th>
                      <th className="p-4 font-semibold text-center">방문 현황</th>
                      <th className="p-4 font-semibold text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          초진/재진
                          <select
                            value={patientTypeFilter}
                            onChange={(e) => setPatientTypeFilter(e.target.value as any)}
                            className="text-xs border border-slate-200 rounded p-1 text-slate-600 bg-white font-normal"
                          >
                            <option value="all">전체</option>
                            <option value="new">초진</option>
                            <option value="existing">재진</option>
                          </select>
                        </div>
                      </th>
                      <th className="p-4 font-semibold text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          현재 상태
                          <select
                            value={patientStatusFilter}
                            onChange={(e) => setPatientStatusFilter(e.target.value as any)}
                            className="text-xs border border-slate-200 rounded p-1 text-slate-600 bg-white font-normal"
                          >
                            <option value="all">전체</option>
                            <option value="pending">승인 대기</option>
                            <option value="approved">예약 확정</option>
                            <option value="done">수납 대기</option>
                            <option value="paid">수납/치료 완료</option>
                            <option value="rejected">거절됨</option>
                            <option value="no_show">노쇼</option>
                          </select>
                        </div>
                      </th>
                      <th className="p-4 font-semibold text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          주 담당
                          <select
                            value={patientTherapistFilter}
                            onChange={(e) => setPatientTherapistFilter(e.target.value)}
                            className="text-xs border border-slate-200 rounded p-1 text-slate-600 bg-white font-normal max-w-[80px]"
                          >
                            <option value="all">전체</option>
                            {therapists.map(t => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                            <option value="없음">없음</option>
                          </select>
                        </div>
                      </th>
                      <th className="p-4 font-semibold text-center">방문일</th>
                      <th className="p-4 font-semibold text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-50">
                    {patientsList.map((p, i) => (
                      <tr key={p.phone} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-center font-bold text-slate-400">{i + 1}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            {p.name}
                            {p.noShowCount >= 2 && (
                              <span className="bg-rose-100 text-rose-700 text-[10px] px-1.5 py-0.5 rounded font-bold" title="누적 노쇼 2회 이상">🚨 요주의</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{p.phone}</div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="text-xs">방문 <strong className="text-sky-600">{p.paidCount}</strong>건</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            (총 예약 {p.totalCount} / 취소 {p.cancelCount})
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {p.isNew 
                            ? <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-semibold">초진</span>
                            : <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-semibold">재진</span>
                          }
                        </td>
                        <td className="p-4 text-center">
                          {p.latestStatus === 'done' ? <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-lg text-xs font-semibold">수납대기</span>
                           : p.latestStatus === 'paid' ? <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-xs font-semibold">수납완료</span>
                           : <span className="bg-slate-50 text-slate-400 px-2 py-1 rounded-lg text-xs font-semibold">{STATUS_MAP[p.latestStatus as keyof typeof STATUS_MAP]?.label || p.latestStatus}</span>}
                        </td>
                        <td className="p-4 text-center text-slate-600 font-medium">
                          {p.mainTherapist}
                        </td>
                        <td className="p-4 text-center text-slate-500 text-xs">
                          <button onClick={() => {
                            setViewingHistoryFor(p);
                            setHistoryMonth(p.latestDate.slice(0, 7) || toDateStr(new Date()).slice(0, 7));
                          }} className="text-sky-600 hover:text-sky-800 font-bold underline underline-offset-2 transition-colors">
                            {p.paidCount}회 방문
                          </button>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              setPinChangePatient({ name: p.name, phone: p.phone });
                              setNewPin('');
                            }}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            비밀번호 초기화
                          </button>
                        </td>
                      </tr>
                    ))}
                    {patientsList.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          검색 결과가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 비밀번호 강제 변경 팝업 */}
            {pinChangePatient && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
                  <h3 className="font-bold text-slate-800 text-lg">비밀번호 강제 변경</h3>
                  <p className="text-sm text-slate-500"><strong>{pinChangePatient.name}</strong> 환자 <strong>{pinChangePatient.phone}</strong>의 비밀번호를 새로 설정합니다.</p>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1.5 block">새로운 PIN (4자리 숫자)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="예: 1234"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handlePinReset} disabled={pinSaving || newPin.length !== 4} className="btn-primary flex-1 py-2 text-sm">
                      {pinSaving ? '변경 중...' : '저장하기'}
                    </button>
                    <button onClick={() => setPinChangePatient(null)} className="btn-secondary flex-1 py-2 text-sm">취소</button>
                  </div>
                </div>
              </div>
            )}

            {/* 방문 날짜 팝업 */}
            {viewingHistoryFor && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-800 text-lg">{viewingHistoryFor.name}님의 방문 기록</h3>
                    <button onClick={() => setViewingHistoryFor(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl mb-2">
                    <button onClick={() => {
                      const [y, m] = historyMonth.split('-').map(Number);
                      const d = new Date(y, m - 2, 1);
                      setHistoryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    }} className="text-slate-400 hover:text-sky-500 font-bold px-3 py-1">◀</button>
                    <span className="font-extrabold text-slate-700">
                      {historyMonth.split('-')[0]}년 {historyMonth.split('-')[1]}월
                    </span>
                    <button onClick={() => {
                      const [y, m] = historyMonth.split('-').map(Number);
                      const d = new Date(y, m, 1);
                      setHistoryMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                    }} className="text-slate-400 hover:text-sky-500 font-bold px-3 py-1">▶</button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                    {(() => {
                      const filteredVisits = viewingHistoryFor.allVisits.filter((v: any) => v.date.startsWith(historyMonth));
                      if (filteredVisits.length === 0) {
                        return <div className="text-center text-slate-400 text-sm py-4">이 달의 방문 기록이 없습니다.</div>;
                      }
                      return filteredVisits.map((visit: any) => {
                        // Calculate overall visit number (since it's sorted newest first)
                        const overallIndex = viewingHistoryFor.allVisits.length - viewingHistoryFor.allVisits.findIndex((v: any) => v.id === visit.id);
                        return (
                          <div key={visit.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-sm font-semibold text-slate-700">
                            <span>{overallIndex}회차 방문</span>
                            <span className="text-sky-600">{formatDate(visit.date)} {visit.start_time.slice(0, 5)}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <button onClick={() => setViewingHistoryFor(null)} className="btn-secondary w-full py-2 text-sm mt-4">닫기</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            탭 6: 정산 관리
        ========================================================================= */}
        {adminTab === 'settlement' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-end flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">인센티브 정산 관리</h2>
                <p className="text-sm text-slate-500">수납 완료된 건을 기준으로 단가와 3.3% 세금을 자동 계산합니다.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => {
                  const data = settlementStats.map(stat => ({
                    '치료사': stat.therapist.name,
                    '이번달 수납완료': stat.count,
                    '인센티브 단가': stat.therapist.incentive,
                    '총 인센티브 (세전)': stat.totalPreTax,
                    '세금 (3.3%)': stat.tax,
                    '실 지급액': stat.totalPostTax
                  }));
                  downloadCSV(data, `인센티브_정산내역_${settlementMonth}`);
                }} className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 font-bold px-4 rounded-xl text-sm transition-colors h-[42px]">
                  📥 엑셀 다운로드
                </button>
                <div className="flex items-center gap-4 bg-white shadow-sm px-5 py-2 rounded-2xl border border-slate-100">
                  <button onClick={handleSettlementMonthPrev} className="text-slate-400 hover:text-sky-500 p-1 font-bold transition-colors text-xl">◀</button>
                  <div 
                    className="relative flex items-center justify-center cursor-pointer hover:text-sky-600 transition-colors"
                    onClick={() => setPickerType('settlement')}
                  >
                    <h2 className="font-extrabold text-xl text-slate-700 min-w-[110px] text-center">
                      {settlementMonth.split('-')[0]}년 {settlementMonth.split('-')[1]}월
                    </h2>
                  </div>
                  <button onClick={handleSettlementMonthNext} className="text-slate-400 hover:text-sky-500 p-1 font-bold transition-colors text-xl">▶</button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {settlementStats.map(stat => (
                <div key={stat.therapist.id} className="card relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: stat.therapist.color }} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        {stat.therapist.name}
                        {!stat.therapist.is_active && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase tracking-wider">퇴사/휴직</span>}
                      </h3>
                      <div className="text-xs text-slate-500 mt-1">
                        이번 달 수납 완료: <strong className="text-sky-600">{stat.count}건</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => setSettlementDetails({ therapistName: stat.therapist.name, res: stat.resList })}
                      className="text-xs text-sky-600 bg-sky-50 px-2 py-1 rounded-lg font-semibold hover:bg-sky-100"
                    >
                      상세 내역 보기
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl space-y-3 mb-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">건당 인센티브 설정액</span>
                      <div className="flex items-center gap-2">
                        {editingIncentive?.id === stat.therapist.id ? (
                          <>
                            <input
                              type="number"
                              className="input-field py-1 px-2 w-24 text-right text-xs"
                              value={editingIncentive.amount}
                              onChange={(e) => setEditingIncentive({ id: stat.therapist.id, amount: Number(e.target.value) })}
                            />
                            <button onClick={handleIncentiveSave} disabled={incentiveSaving === stat.therapist.id} className="text-xs bg-sky-500 text-white px-2 py-1 rounded hover:bg-sky-600">저장</button>
                            <button onClick={() => setEditingIncentive(null)} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-slate-700">{stat.incentiveAmount.toLocaleString()}원</span>
                            <button onClick={() => setEditingIncentive({ id: stat.therapist.id, amount: stat.incentiveAmount })} className="text-[10px] text-slate-400 hover:text-sky-500 underline">수정</button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">세전 총액 ({stat.count}건)</span>
                      <strong className="text-slate-800">{stat.totalPreTax.toLocaleString()}원</strong>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">세금 공제 (3.3%)</span>
                      <strong className="text-red-500">- {stat.tax.toLocaleString()}원</strong>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="font-bold text-slate-800">세후 실지급액</span>
                    <span className="text-xl font-extrabold text-sky-600">{stat.totalPostTax.toLocaleString()}원</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 정산 상세 내역 팝업 */}
            {settlementDetails && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 overflow-y-auto py-8">
                <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-fade-in-up my-auto">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">{settlementDetails.therapistName} 상세 내역</h3>
                      <p className="text-sm text-slate-500">{settlementMonth} 수납 완료 총 {settlementDetails.res.length}건</p>
                    </div>
                    <button onClick={() => setSettlementDetails(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
                  </div>
                  
                  <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-2">
                    {settlementDetails.res.length === 0 ? (
                      <p className="text-center text-sm text-slate-400 py-8">이번 달 내역이 없습니다.</p>
                    ) : (
                      settlementDetails.res.sort((a,b) => (a.date+' '+a.start_time).localeCompare(b.date+' '+b.start_time)).map((r, idx) => (
                        <div key={r.id} className="bg-slate-50 p-3 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="font-bold text-sm text-slate-800">{idx + 1}. {r.patient_name} <span className="text-xs font-normal text-slate-500 ml-1">{r.patient_phone}</span></div>
                            <div className="text-xs text-slate-500 mt-0.5">{formatDate(r.date)} {formatTime(r.start_time)} ({r.duration}분)</div>
                          </div>
                          <span className="text-xs font-bold bg-white px-2 py-1 rounded-lg text-emerald-600 border border-emerald-100">수납 완료</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            탭 7: 알림 내역 (SMS/알림톡)
        ========================================================================= */}
        {adminTab === 'sms' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-xl font-bold text-slate-800">알리고 알림내역</h2>
                <p className="text-sm text-slate-500">발송된 알림톡/문자 메시지 기록입니다.</p>
              </div>
              <button onClick={() => {
                setLogDeleteTarget({ type: 'sms', label: '알리고 알림내역' });
                setLogDeletePassword('');
                setShowLogDeletePassword(false);
              }} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 font-bold px-3 py-1.5 rounded-lg transition-colors border border-red-200">
                🗑 알림 내역 삭제
              </button>
            </div>

            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                      <th className="p-4 font-bold w-40">발송 일시</th>
                      <th className="p-4 font-bold w-24">상태</th>
                      <th className="p-4 font-bold w-32">수신자</th>
                      <th className="p-4 font-bold w-32">발신자</th>
                      <th className="p-4 font-bold">메시지 내용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {smsLogs.map((log) => {
                      const date = new Date(log.created_at);
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-slate-400 font-medium whitespace-nowrap">{dateStr}</td>
                          <td className="p-4">
                            <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-bold">발송성공</span>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-700">{log.patient_name}</div>
                            <div className="text-xs text-slate-400">{log.patient_phone}</div>
                          </td>
                          <td className="p-4 font-semibold text-slate-600">{log.sent_by}</td>
                          <td className="p-4 text-slate-600 leading-relaxed text-xs">
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 max-w-lg break-keep">
                              {log.message}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {smsLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">발송된 알림 내역이 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Custom Month Picker Modal */}
        {pickerType === 'list' && (
          <MonthPickerModal
            initialYear={parseInt(listMonth.split('-')[0])}
            initialMonth={parseInt(listMonth.split('-')[1])}
            onSelect={(y, m) => {
              setListMonth(`${y}-${String(m).padStart(2, '0')}`);
              setFilterDateMode('month');
            }}
            onClose={() => setPickerType(null)}
          />
        )}
        {pickerType === 'monthly' && (
          <MonthPickerModal
            initialYear={calYear}
            initialMonth={calMonth + 1}
            onSelect={(y, m) => setCurrentMonth(new Date(y, m - 1, 1))}
            onClose={() => setPickerType(null)}
          />
        )}
        {pickerType === 'settlement' && (
          <MonthPickerModal
            initialYear={parseInt(settlementMonth.split('-')[0])}
            initialMonth={parseInt(settlementMonth.split('-')[1])}
            onSelect={(y, m) => setSettlementMonth(`${y}-${String(m).padStart(2, '0')}`)}
            onClose={() => setPickerType(null)}
          />
        )}

      </div>

      {/* =========================================================================
          로그 삭제 팝업
      ========================================================================= */}
      {logDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
            <h3 className="font-bold text-red-600 text-lg">⚠️ 로그 기록 삭제</h3>
            <p className="text-sm text-slate-600">
              정말로 <strong>[{logDeleteTarget.label}]</strong> 기록을 모두 삭제하시겠습니까?<br />
              <span className="text-xs text-red-500">(실제 데이터베이스에서 영구 삭제되며 복구할 수 없습니다)</span>
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">관리자 비밀번호</label>
              <div className="relative">
                <input
                  type={showLogDeletePassword ? 'text' : 'password'}
                  className="input-field pr-16"
                  placeholder="비밀번호를 입력하세요"
                  value={logDeletePassword}
                  onChange={(e) => setLogDeletePassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowLogDeletePassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showLogDeletePassword ? '숨기기' : '보기'}
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={confirmLogDelete} 
                disabled={!logDeletePassword} 
                className="btn-primary bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600 text-white font-semibold rounded-xl flex-1 py-2 text-sm transition-colors disabled:opacity-50"
              >
                삭제 진행
              </button>
              <button onClick={() => setLogDeleteTarget(null)} className="btn-secondary flex-1 py-2 text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          일별 예약 현황 상세 팝업 (월간 치료사 통계 탭)
      ========================================================================= */}
      {dailyStatsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm animate-fade-in-up">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 text-lg">
                {dailyStatsModal.date.split('-')[0]}년 {dailyStatsModal.date.split('-')[1]}월 {dailyStatsModal.date.split('-')[2]}일
              </h3>
              <button onClick={() => setDailyStatsModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {dailyStatsModal.reservations.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((res) => {
                const th = therapists.find(t => t.id === res.therapist_id);
                return (
                  <div key={res.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-sm">{res.patient_name}</span>
                        {th ? (
                          <span className="text-[10px] text-white px-1.5 py-0.5 rounded shadow-sm" style={{ backgroundColor: th.color }}>
                            {th.name}
                          </span>
                        ) : (
                          <span className="text-[10px] text-white px-1.5 py-0.5 rounded shadow-sm bg-slate-400">
                            미정
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{res.patient_phone}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sky-600">{res.start_time.slice(0, 5)}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{res.duration}분</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setDailyStatsModal(null)} className="btn-secondary w-full py-2 mt-4 text-sm">닫기</button>
          </div>
        </div>
      )}

      {/* =========================================================================
          탭 8: 휴무 관리
      ========================================================================= */}
      {adminTab === 'leaves' && (() => {
        const lcFirstDay = new Date(leavesCalYear, leavesCalMonth, 1).getDay();
        const lcDaysInMonth = new Date(leavesCalYear, leavesCalMonth + 1, 0).getDate();
        const lcDays: (number | null)[] = [];
        for (let i = 0; i < lcFirstDay; i++) lcDays.push(null);
        for (let i = 1; i <= lcDaysInMonth; i++) lcDays.push(i);
        const lcMonthStr = `${leavesCalYear}-${String(leavesCalMonth + 1).padStart(2, '0')}`;
        const lcLeaves = leaves.filter(l => l.date.startsWith(lcMonthStr));

        // 이번 달 휴무 통계
        const therapistStats = therapists.map(th => {
          const thLeaves = lcLeaves.filter(l => l.therapist_id === th.id);
          const annual = thLeaves.filter(l => l.reason?.includes('연차')).length;
          const morning = thLeaves.filter(l => l.reason?.includes('오전반차')).length;
          const afternoon = thLeaves.filter(l => l.reason?.includes('오후반차')).length;
          return { name: th.name, annual, morning, afternoon, total: thLeaves.length };
        }).filter(stat => stat.total > 0);

        return (
        <div className="space-y-6 animate-fade-in-up">
          <h2 className="text-xl font-bold text-slate-800 mb-4">휴무 관리</h2>
          
          {therapistStats.length > 0 && (
            <div className="card mb-4 bg-indigo-50 border-indigo-100">
              <h3 className="font-bold text-indigo-800 mb-2">이번 달 휴무 사용 통계 ({leavesCalYear}년 {leavesCalMonth + 1}월)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {therapistStats.map(stat => (
                  <div key={stat.name} className="bg-white p-3 rounded-xl shadow-sm border border-indigo-50">
                    <div className="font-bold text-slate-700 mb-1">{stat.name}</div>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      <div className="flex justify-between"><span>연차:</span> <span className="font-semibold text-slate-700">{stat.annual}회</span></div>
                      <div className="flex justify-between"><span>오전반차:</span> <span className="font-semibold text-slate-700">{stat.morning}회</span></div>
                      <div className="flex justify-between"><span>오후반차:</span> <span className="font-semibold text-slate-700">{stat.afternoon}회</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 달력 뷰 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => {
                if (leavesCalMonth === 0) { setLeavesCalYear(y => y - 1); setLeavesCalMonth(11); }
                else setLeavesCalMonth(m => m - 1);
              }} className="p-2 text-slate-400 hover:text-sky-500 font-bold text-lg transition-colors">◀</button>
              <h3 className="font-bold text-lg text-slate-800">{leavesCalYear}년 {leavesCalMonth + 1}월 휴무 현황</h3>
              <button onClick={() => {
                if (leavesCalMonth === 11) { setLeavesCalYear(y => y + 1); setLeavesCalMonth(0); }
                else setLeavesCalMonth(m => m + 1);
              }} className="p-2 text-slate-400 hover:text-sky-500 font-bold text-lg transition-colors">▶</button>
            </div>

            {/* 치료사 범례 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {therapists.map(t => (
                <span key={t.id} className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
                      style={{ backgroundColor: t.color + '22', color: t.color }}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['일','월','화','수','목','금','토'].map((d, i) => (
                <div key={d} className={`text-xs font-bold py-1.5 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {lcDays.map((d, i) => {
                if (!d) return <div key={`e-${i}`} className="min-h-[80px] rounded-xl bg-slate-50/50" />;
                const dateStr = `${leavesCalYear}-${String(leavesCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayLeaves = lcLeaves.filter(l => l.date === dateStr);
                const isToday = dateStr === today;
                return (
                  <div key={d} className={`min-h-[80px] border rounded-xl p-1 flex flex-col transition-colors ${isToday ? 'border-sky-300 bg-sky-50/50' : 'border-slate-100 bg-white'}`}>
                    <span className={`text-xs font-bold ${i % 7 === 0 ? 'text-rose-500' : i % 7 === 6 ? 'text-blue-500' : 'text-slate-600'}`}>{d}</span>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayLeaves.map(l => {
                        const th = therapists.find(t => t.id === l.therapist_id);
                        return (
                          <button key={l.id}
                            onClick={() => { setEditingLeave(l); setEditLeaveStart(l.start_time.slice(0,5)); setEditLeaveEnd(l.end_time.slice(0,5)); setEditLeaveReason(l.reason || ''); }}
                            className="text-[9px] font-bold px-1 py-0.5 rounded truncate text-left hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: (th?.color || '#94a3b8') + '33', color: th?.color || '#64748b' }}
                            title={`${th?.name} ${l.start_time.slice(0,5)}~${l.end_time.slice(0,5)} ${l.reason || ''}`}
                          >
                            {th?.name?.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 text-center mt-3">달력의 치료사 태그를 클릭하면 수정할 수 있습니다.</p>
          </div>

          {/* 새 휴무 등록 폼 */}
          <div className="card space-y-4">
            <h3 className="font-bold text-slate-700">새 휴무 등록</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 block mb-1">치료사</label>
                <select className="input-field" value={leaveTherapistId} onChange={e => setLeaveTherapistId(e.target.value)}>
                  <option value="">치료사 선택</option>
                  {therapists.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 block mb-1">날짜</label>
                <input type="date" className="input-field" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} />
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 block mb-1">휴무 종류</label>
                <select className="input-field" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                  <option value="오전반차">오전반차</option>
                  <option value="오후반차">오후반차</option>
                  <option value="연차">연차</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="text-xs font-semibold text-slate-600 block mb-1">사유</label>
                <input type="text" placeholder="사유 (선택)" className="input-field" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} />
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={async () => {
                if (!leaveTherapistId) return alert('치료사를 선택하세요.');
                
                let startT = '00:00';
                let endT = '23:59';
                if (leaveType === '오전반차') {
                  startT = '09:00';
                  endT = '13:30';
                } else if (leaveType === '오후반차') {
                  startT = '12:30';
                  endT = '23:59';
                }

                setLeaveLoading('create');
                const res = await insertTherapistLeave(leaveTherapistId, leaveDate, startT, endT, `[${leaveType}] ${leaveReason}`.trim());
                if (res.success) {
                  setLeaveReason('');
                  await loadData();
                } else {
                  alert('휴무 등록에 실패했습니다.');
                }
                setLeaveLoading(null);
              }}
              disabled={leaveLoading === 'create'}
            >
              {leaveLoading === 'create' ? '등록 중...' : '휴무 등록하기'}
            </button>
          </div>

          {/* 전체 목록 */}
          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-700">전체 휴무 목록</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                    <th className="p-4 font-semibold text-center">치료사</th>
                    <th className="p-4 font-semibold text-center">날짜</th>
                    <th className="p-4 font-semibold text-center">시간</th>
                    <th className="p-4 font-semibold">사유</th>
                    <th className="p-4 font-semibold text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50">
                  {leaves.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">등록된 휴무가 없습니다.</td></tr>
                  )}
                  {[...leaves].sort((a, b) => b.date.localeCompare(a.date)).map(leave => {
                    const th = therapists.find(t => t.id === leave.therapist_id);
                    return (
                      <tr key={leave.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-center">
                          <span className="flex items-center justify-center gap-1.5 font-bold text-slate-800">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th?.color }} />
                            {th?.name || '알 수 없음'}
                          </span>
                        </td>
                        <td className="p-4 text-center text-slate-600">{formatDate(leave.date)}</td>
                        <td className="p-4 text-center text-slate-600 font-mono text-xs">{leave.start_time.slice(0,5)} ~ {leave.end_time.slice(0,5)}</td>
                        <td className="p-4 text-slate-600">{leave.reason || '-'}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => { setEditingLeave(leave); setEditLeaveStart(leave.start_time.slice(0,5)); setEditLeaveEnd(leave.end_time.slice(0,5)); setEditLeaveReason(leave.reason || ''); }}
                              className="text-xs text-sky-600 hover:text-sky-800 font-bold px-2 py-1 rounded-lg border border-sky-200 hover:bg-sky-50 transition-colors"
                            >수정</button>
                            <button
                              onClick={async () => {
                                if (!confirm('이 휴무를 삭제하시겠습니까?')) return;
                                setLeaveLoading(leave.id);
                                await deleteTherapistLeave(leave.id);
                                await loadData();
                                setLeaveLoading(null);
                              }}
                              disabled={leaveLoading === leave.id}
                              className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 transition-colors"
                            >
                              {leaveLoading === leave.id ? '삭제 중...' : '삭제'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 휴무 수정 모달 */}
          {editingLeave && (() => {
            const th = therapists.find(t => t.id === editingLeave.therapist_id);
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
                <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in-up">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">휴무 수정</h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        <span className="font-semibold" style={{ color: th?.color }}>{th?.name}</span> · {formatDate(editingLeave.date)}
                      </p>
                    </div>
                    <button onClick={() => setEditingLeave(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-600 block mb-1">휴무 종류 (수정 시 시작/종료 시간이 변경됩니다)</label>
                      <select className="input-field" onChange={e => {
                        const t = e.target.value;
                        if (t === '오전반차') { setEditLeaveStart('09:00'); setEditLeaveEnd('13:30'); }
                        else if (t === '오후반차') { setEditLeaveStart('12:30'); setEditLeaveEnd('23:59'); }
                        else if (t === '연차') { setEditLeaveStart('00:00'); setEditLeaveEnd('23:59'); }
                      }}>
                        <option value="">휴무 종류를 선택하면 시간이 자동 지정됩니다</option>
                        <option value="오전반차">오전반차</option>
                        <option value="오후반차">오후반차</option>
                        <option value="연차">연차</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">시작 시간</label>
                      <input type="time" className="input-field" value={editLeaveStart} onChange={e => setEditLeaveStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">종료 시간</label>
                      <input type="time" className="input-field" value={editLeaveEnd} onChange={e => setEditLeaveEnd(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-slate-600 block mb-1">사유</label>
                      <input type="text" className="input-field" placeholder="사유 (선택)" value={editLeaveReason} onChange={e => setEditLeaveReason(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      className="btn-primary flex-1"
                      disabled={leaveLoading === 'edit'}
                      onClick={async () => {
                        if (editLeaveStart >= editLeaveEnd) return alert('종료 시간은 시작 시간보다 늦어야 합니다.');
                        setLeaveLoading('edit');
                        const res = await updateTherapistLeave(editingLeave.id, editLeaveStart, editLeaveEnd, editLeaveReason);
                        if (res.success) {
                          setEditingLeave(null);
                          await loadData();
                        } else {
                          alert('수정에 실패했습니다.');
                        }
                        setLeaveLoading(null);
                      }}
                    >
                      {leaveLoading === 'edit' ? '저장 중...' : '✓ 저장'}
                    </button>
                    <button onClick={() => setEditingLeave(null)} className="btn-secondary flex-1">취소</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        );
      })()}

    </div>
  );
}

function StatCard({ label, value, color, highlight, onClick, isActive }: {
  label: string; value: number; color: string; highlight?: boolean; onClick?: () => void; isActive?: boolean;
}) {
  return (
    <div onClick={onClick} className={`card text-center py-4 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''} ${highlight ? 'border-2 border-amber-300 bg-amber-50' : ''} ${isActive ? 'ring-2 ring-sky-400 shadow-md bg-sky-50' : ''}`}>
      <div className={`text-3xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function MonthPickerModal({
  initialYear,
  initialMonth,
  onSelect,
  onClose
}: {
  initialYear: number;
  initialMonth: number;
  onSelect: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(initialYear);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-[280px] animate-fade-in-up">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setYear(y => y - 1)} className="p-2 text-slate-400 hover:text-sky-500 font-bold text-xl transition-colors">◀</button>
          <span className="text-xl font-bold text-slate-800">{year}년</span>
          <button onClick={() => setYear(y => y + 1)} className="p-2 text-slate-400 hover:text-sky-500 font-bold text-xl transition-colors">▶</button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <button
              key={i}
              onClick={() => { onSelect(year, i + 1); onClose(); }}
              className={`py-3 rounded-2xl text-sm font-semibold transition-colors
                ${year === initialYear && i + 1 === initialMonth ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-sky-50 hover:text-sky-600'}`}
            >
              {i + 1}월
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn-secondary w-full py-3">닫기</button>
      </div>
    </div>
  );
}
