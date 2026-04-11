import { useState } from 'react'
import {
  Rocket, LayoutDashboard, ListChecks, CircleDollarSign,
  Users, FormInput, LockKeyhole, SquareLibrary, Cog,
  ChevronRight, ChevronLeft,
} from 'lucide-react'
import './Sidebar.css'

const NAV_ITEMS = [
  { key: 'dashboard',     label: 'Mission Control', Icon: Rocket           },
  { key: 'board',         label: 'Start to Close',  Icon: LayoutDashboard  },
  { key: 'tasks',         label: 'Tasks',           Icon: ListChecks       },
  { key: 'commissions',   label: 'Commissions',     Icon: CircleDollarSign },
  { key: 'collaborators', label: 'Collaborators',   Icon: Users            },
  { key: 'templates',     label: 'Templates',       Icon: FormInput        },
  { key: 'showings',      label: 'Showings',        Icon: LockKeyhole      },
  { key: 'reporting',     label: 'Reporting',       Icon: SquareLibrary    },
]

export default function Sidebar({ activeTab, onTabChange, onSettingsOpen }) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('legacyos-sidebar-collapsed')
    return stored !== null ? stored === 'true' : true
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('legacyos-sidebar-collapsed', String(next))
  }

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>

      <div className="sidebar-toggle" onClick={toggle}>
        {collapsed
          ? <ChevronRight size={15} />
          : <ChevronLeft  size={15} />
        }
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`sidebar-item${activeTab === key ? ' sidebar-item--active' : ''}`}
            data-label={label}
            onClick={() => onTabChange(key)}
          >
            <Icon size={collapsed ? 20 : 18} className="sidebar-icon" />
            {!collapsed && <span className="sidebar-label">{label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          className="sidebar-item sidebar-item--settings"
          data-label="Settings"
          onClick={onSettingsOpen}
        >
          <Cog size={collapsed ? 20 : 18} className="sidebar-icon" />
          {!collapsed && <span className="sidebar-label">Settings</span>}
        </button>
      </div>

    </aside>
  )
}
