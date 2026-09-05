import { useState } from 'react'
import { DollarSign, Clock, CheckCircle, ArrowRight } from 'lucide-react'
import { SignupLink } from './Common'

export function ROICalculator() {
  const [monthlyTickets, setMonthlyTickets] = useState<number>(1500)

  // Calculations:
  // Avg resolution cost per ticket = $8.50
  // Deflection rate = 72%
  // Hours per ticket = 12 mins (0.2h)
  const deflectedTickets = Math.round(monthlyTickets * 0.72)
  const monthlySavings = Math.round(deflectedTickets * 8.5)
  const hoursSaved = Math.round(deflectedTickets * 0.2)

  return (
    <div className="w-full bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-[#E5E2DB] flex flex-col">
      <div className="mb-8">
        <span className="text-[10px] tracking-widest uppercase font-semibold text-[#526B54] mb-2 block">Instant ROI Calculator</span>
        <h3 className="text-2xl font-bold text-[#1C1C1C]">Calculate your monthly support savings</h3>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium text-[#4A4A4A]">Estimated Monthly Ticket Volume:</span>
            <strong className="text-lg font-bold text-[#526B54]">{monthlyTickets.toLocaleString()} tickets/mo</strong>
          </div>
          <input
            type="range"
            min="200"
            max="10000"
            step="100"
            value={monthlyTickets}
            onChange={(e) => setMonthlyTickets(Number(e.target.value))}
            className="w-full h-2 bg-[#E5E2DB] rounded-lg appearance-none cursor-pointer accent-[#526B54]"
          />
          <div className="flex justify-between text-xs text-[#A3A3A3] mt-3 font-medium">
            <span>200</span>
            <span>2,500</span>
            <span>5,000</span>
            <span>10,000+</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="flex items-center gap-4 bg-[#FCFBF9] border border-[#E5E2DB] p-4 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center shrink-0">
              <DollarSign size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-[#737373]">Est. Monthly Savings</span>
              <strong className="text-2xl font-bold text-[#1C1C1C] tabular-nums">${monthlySavings.toLocaleString()}</strong>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#FCFBF9] border border-[#E5E2DB] p-4 rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-[#F0F4F8] text-[#3B82F6] flex items-center justify-center shrink-0">
              <Clock size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-[#737373]">Hours Saved / Month</span>
              <strong className="text-2xl font-bold text-[#1C1C1C] tabular-nums">{hoursSaved.toLocaleString()} hrs</strong>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-[#E5E2DB] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#526B54]">
            <CheckCircle size={16} /> 72% Average Ticket Deflection
          </div>
          <SignupLink placement="calculator" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1C1C1C] text-white text-sm font-semibold rounded-xl hover:bg-[#2A2A2A] transition-colors" />
        </div>
      </div>
    </div>
  )
}
