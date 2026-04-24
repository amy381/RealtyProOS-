import { useState, useEffect } from 'react'
import {
  Rocket, LayoutDashboard, ListChecks, CircleDollarSign,
  Users, FileText, LockKeyhole, SquareLibrary, Settings,
  ChevronRight, ChevronLeft,
} from 'lucide-react'
import './Sidebar.css'

const NAV_ITEMS = [
  { key: 'dashboard',     label: 'Mission Control', Icon: Rocket           },
  { key: 'board',         label: 'Board',           Icon: LayoutDashboard  },
  { key: 'tasks',         label: 'Tasks',           Icon: ListChecks       },
  { key: 'commissions',   label: 'Commissions',     Icon: CircleDollarSign },
  { key: 'collaborators', label: 'Collaborators',   Icon: Users            },
  { key: 'templates',     label: 'Templates',       Icon: FileText         },
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

const TEMPLATES_SUB = [
  { key: 'task-templates',   label: 'Task Templates'   },
  { key: 'email-templates',  label: 'Email Templates'  },
  { key: 'vendor-templates', label: 'Vendor Templates' },
]

const TASKS_SUB = [
  { key: 'tasks',      label: 'Tasks'      },
  { key: 'send-queue', label: 'Send Queue' },
  { key: 'sent-log',   label: 'Sent Log'   },
]

export default function Sidebar({
  activeTab,
  onTabChange,
  onSettingsOpen,
  collaboratorFilter,
  onCollaboratorFilterChange,
  templatesFilter,
  onTemplatesFilterChange,
  tasksFilter,
  onTasksFilterChange,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem('legacyos-sidebar-collapsed')
    return stored !== null ? stored === 'true' : true
  })

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '52px' : '180px')
  }, [collapsed])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('legacyos-sidebar-collapsed', String(next))
  }

  const collabOpen       = activeTab === 'collaborators'
  const hasActiveSubItem = collabOpen && !!collaboratorFilter
  const templatesOpen    = activeTab === 'templates'
  const hasActiveTplSub  = templatesOpen && !!templatesFilter
  const tasksOpen        = activeTab === 'tasks'
  const hasActiveTaskSub = tasksOpen && !!tasksFilter

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>

      <div className="sidebar-toggle" onClick={toggle}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <div key={key} className="sidebar-item-group">
            <button
              className={`sidebar-item${activeTab === key ? ' sidebar-item--active' : ''}`}
              data-label={label}
              onClick={() => onTabChange(key)}
            >
              <Icon size={18} className="sidebar-icon" />
              {!collapsed && <span className="sidebar-label">{label}</span>}
              {collapsed && key === 'collaborators' && hasActiveSubItem && (
                <span className="sidebar-sub-dot" />
              )}
              {collapsed && key === 'templates' && hasActiveTplSub && (
                <span className="sidebar-sub-dot" />
              )}
              {collapsed && key === 'tasks' && hasActiveTaskSub && (
                <span className="sidebar-sub-dot" />
              )}
            </button>

            {key === 'collaborators' && collabOpen && !collapsed && (
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

            {key === 'tasks' && tasksOpen && !collapsed && (
              <div className="sidebar-sub-items">
                {TASKS_SUB.map(sub => (
                  <button
                    key={sub.key}
                    className={`sidebar-sub-item${tasksFilter === sub.key ? ' sidebar-sub-item--active' : ''}`}
                    onClick={() => onTasksFilterChange?.(sub.key)}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}

            {key === 'templates' && templatesOpen && !collapsed && (
              <div className="sidebar-sub-items">
                {TEMPLATES_SUB.map(sub => (
                  <button
                    key={sub.key}
                    className={`sidebar-sub-item${templatesFilter === sub.key ? ' sidebar-sub-item--active' : ''}`}
                    onClick={() => onTemplatesFilterChange?.(sub.key)}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          className="sidebar-item sidebar-item--settings"
          data-label="Settings"
          onClick={onSettingsOpen}
        >
          <Settings size={18} className="sidebar-icon" />
          {!collapsed && <span className="sidebar-label">Settings</span>}
        </button>
      </div>

    </aside>
  )
}
