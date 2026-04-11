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

const COLLAB_SUB = [
  { key: 'title-escrow',    label: 'Title / Escrow'  },
  { key: 'lenders',         label: 'Lenders'         },
  { key: 'home-inspectors', label: 'Home Inspectors' },
  { key: 'coop-agents',     label: 'Co-op Agents'    },
  { key: 'other-vendors',   label: 'Other Vendors'   },
]

export default function Sidebar({
  activeTab,
  onTabChange,
  onSettingsOpen,
  collaboratorFilter,
  onCollaboratorFilterChange,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('legacyos-sidebar-collapsed')
    return stored !== null ? stored === 'true' : true
  })

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('legacyos-sidebar-collapsed', String(next))
  }

  const collabOpen = activeTab === 'collaborators'
  const hasActiveSubItem = collabOpen && !!collaboratorFilter

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>

      <div className="sidebar-toggle" onClick={toggle}>
        {collapsed
          ? <ChevronRight size={15} />
          : <ChevronLeft  size={15} />
        }
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ key, label, Icon }) => {
          const isCollabParent = key === 'collaborators'
          return (
            <div key={key} className="sidebar-item-group">
              {/* Main nav item */}
              <button
                className={`sidebar-item${activeTab === key ? ' sidebar-item--active' : ''}`}
                data-label={label}
                onClick={() => onTabChange(key)}
              >
                <Icon size={collapsed ? 20 : 18} className="sidebar-icon" />
                {!collapsed && <span className="sidebar-label">{label}</span>}
                {/* Collapsed dot when a sub-item is active */}
                {collapsed && isCollabParent && hasActiveSubItem && (
                  <span className="sidebar-sub-dot" />
                )}
              </button>

              {/* Sub-items — visible when expanded + collaborators active */}
              {isCollabParent && collabOpen && !collapsed && (
                <div className="sidebar-sub-items">
                  {COLLAB_SUB.map(sub => (
                    <button
                      key={sub.key}
                      className={`sidebar-sub-item${collaboratorFilter === sub.key ? ' sidebar-sub-item--active' : ''}`}
                      onClick={() => onCollaboratorFilterChange?.(sub.key)}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
