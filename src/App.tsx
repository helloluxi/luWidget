import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition, PhysicalSize, availableMonitors } from "@tauri-apps/api/window";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  deletingTimeout?: number;
}

interface WidgetState {
  x: number;
  y: number;
  width: number;
  height: number;
}

function App() {
  const maxMinutes = 60, initMinutes = 45;
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Timer state
  const [minutes, setMinutes] = useState(initMinutes);
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);

  const storageKey = "todo-items";

  const loadTodosFromStorage = (): TodoItem[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      return JSON.parse(raw) as TodoItem[];
    } catch (error) {
      console.error('Failed to read saved todos', error);
      return [];
    }
  };

  const saveTodosToStorage = (items: TodoItem[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (error) {
      console.error('Failed to persist todos', error);
    }
  };

  // Position and size persistence
  useEffect(() => {
    const window = getCurrentWindow();
    let saveTimeout: number | null = null;
    let isInitialized = false;

    const saveState = async () => {
      if (!isInitialized) return;

      try {
        const position = await window.outerPosition();
        const size = await window.innerSize();

        const state: WidgetState = {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
        };

        localStorage.setItem('widget-state', JSON.stringify(state));
      } catch (e) {
        console.error("Failed to save widget state:", e);
      }
    };

    const debouncedSave = () => {
      if (saveTimeout !== null) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(saveState, 500) as unknown as number;
    };

    const loadState = async () => {
      try {
        const savedState = localStorage.getItem('widget-state');
        if (savedState) {
          const state: WidgetState = JSON.parse(savedState);

          await new Promise(resolve => setTimeout(resolve, 100));

          // Get available monitors to ensure window is in bounds
          const monitors = await availableMonitors();
          if (monitors.length > 0) {
            // Check if position is within any monitor bounds
            let isInBounds = false;
            for (const monitor of monitors) {
              const monRight = monitor.position.x + monitor.size.width;
              const monBottom = monitor.position.y + monitor.size.height;
              
              if (state.x >= monitor.position.x && 
                  state.x + state.width <= monRight &&
                  state.y >= monitor.position.y && 
                  state.y + state.height <= monBottom) {
                isInBounds = true;
                break;
              }
            }

            // Only restore position if in bounds, otherwise use default position
            if (isInBounds) {
              await window.setPosition(new PhysicalPosition(state.x, state.y));
              await window.setSize(new PhysicalSize(state.width, state.height));
            }
          }
        }
      } catch (e) {
        console.error("Failed to load widget state:", e);
      } finally {
        setTimeout(() => {
          isInitialized = true;
        }, 200);
      }
    };

    loadState();

    const unlistenMove = window.onMoved(() => debouncedSave());
    const unlistenResize = window.onResized(() => debouncedSave());

    return () => {
      unlistenMove.then((fn) => fn());
      unlistenResize.then((fn) => fn());
      if (saveTimeout !== null) {
        clearTimeout(saveTimeout);
      }
    };
  }, []);

  useEffect(() => {
    setTodos(loadTodosFromStorage());
  }, []);

  useEffect(() => {
    saveTodosToStorage(todos);
  }, [todos]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Timer logic
  const handleTimerComplete = useCallback(async () => {
    setIsRunning(false);
    setMinutes(0);
    setSeconds(0);
    
    // Show custom notification window
    try {
      await invoke('show_notification', { message: 'Time for a break!' });
    } catch (e) {
      console.error('Failed to show notification:', e);
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setSeconds((prevSeconds) => {
          if (prevSeconds === 0) {
            setMinutes((prevMinutes) => {
              if (prevMinutes === 0) {
                handleTimerComplete();
                return 0;
              }
              return prevMinutes - 1;
            });
            return 59;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, handleTimerComplete]);

  const toggleTimer = () => {
    if (!isRunning) {
      if (minutes === 0 && seconds === 0) {
        setMinutes(initMinutes);
      }
      setIsRunning(true);
    } else {
      setIsRunning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -1 : 1;
    setMinutes((prev) => {
      const newMinutes = prev + delta;
      if (newMinutes < 0) return 0;
      if (newMinutes > maxMinutes) return maxMinutes;
      return newMinutes;
    });
    setSeconds(0);
  };

  const handleAddTodo = (text: string) => {
    if (!text.trim()) return;

    const newTodo: TodoItem = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `todo-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      text: text.trim(),
      completed: false,
    };

    setTodos(prev => [...prev, newTodo]);

    setTimeout(() => {
      setEditingId('new');
      setEditText('');
    }, 100);
  };

  const handleEditTodo = (id: string, newText: string) => {
    if (!newText.trim()) return;

    setTodos(prev => prev.map(todo =>
      todo.id === id
        ? { ...todo, text: newText.trim() }
        : todo
    ));
    setEditingId(null);
  };

  const handleCheckTodo = (id: string) => {
    // Mark as deleting
    setDeletingId(id);

    // Set a timeout to actually delete after 15 seconds
    const timeoutId = window.setTimeout(() => {
      setTodos(prev => prev.filter(todo => todo.id !== id));
      setDeletingId(null);
    }, 15000);

    // Store the timeout ID in the todo item so we can cancel it
    setTodos(prev => prev.map(todo =>
      todo.id === id
        ? { ...todo, deletingTimeout: timeoutId }
        : todo
    ));
  };

  const handleCancelDelete = (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (todo?.deletingTimeout) {
      clearTimeout(todo.deletingTimeout);
    }
    setDeletingId(null);
    setTodos(prev => prev.map(todo =>
      todo.id === id
        ? { ...todo, deletingTimeout: undefined }
        : todo
    ));
  };

  const handleDoubleClick = (id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  };

  const handleCopyTodo = (text: string) => {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Failed to copy text:", err);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === "Enter") {
      handleEditTodo(id, editText);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  const handleNewItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddTodo(editText);
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditText("");
    }
  };

  const handleClose = async () => {
    try {
      await invoke("exit_app");
    } catch (e) {
      console.error("Failed to close application:", e);
    }
  };

  const preventMaximize = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Calculate timer circle
  const size = 80;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const totalSeconds = maxMinutes * 60;
  const currentSeconds = minutes * 60 + seconds;
  const progress = (currentSeconds / totalSeconds) * circumference;
  const offset = circumference - progress;

  return (
    <div
      className="widget-container"
      data-tauri-drag-region
      onMouseDown={preventMaximize}
    >
      <div className="todo-header" data-tauri-drag-region>
        <div className="todo-title">luWidget</div>
        <button className="widget-close-btn" onClick={handleClose} title="Close">×</button>
      </div>

      <div className="todo-content" data-tauri-drag-region>
        <div className="todo-list" data-tauri-drag-region>
        {todos.map(todo => (
          <div key={todo.id} className={`todo-item ${deletingId === todo.id ? 'completing' : ''}`}>
            <button
              className={`todo-check ${deletingId === todo.id ? 'deleting' : ''}`}
              onClick={() => deletingId === todo.id ? handleCancelDelete(todo.id) : handleCheckTodo(todo.id)}
              title={deletingId === todo.id ? "Undo" : "Mark as done"}
            >
            </button>
            {editingId === todo.id ? (
              <input
                ref={inputRef}
                type="text"
                className="todo-edit-input"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, todo.id)}
                onBlur={() => handleEditTodo(todo.id, editText)}
              />
            ) : (
              <div
                className="todo-text"
                onDoubleClick={() => handleDoubleClick(todo.id, todo.text)}
              >
                {todo.text}
              </div>
            )}
            <button
              className="todo-copy-btn"
              onClick={() => handleCopyTodo(todo.text)}
              title="Copy to clipboard"
            >
              ⎘
            </button>
          </div>
        ))}

        <div className="todo-item new-todo">
          <button className="todo-check" style={{ visibility: 'hidden' }}>
          </button>
          {editingId === 'new' ? (
            <input
              ref={inputRef}
              type="text"
              className="todo-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleNewItemKeyDown}
              onBlur={() => {
                if (editText.trim()) {
                  handleAddTodo(editText);
                } else {
                  setEditingId(null);
                  setEditText("");
                }
              }}
              placeholder="New item..."
            />
          ) : (
            <div
              className="todo-text empty"
              onClick={() => {
                setEditingId('new');
                setEditText("");
              }}
            >
              Add new item...
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Timer in bottom right corner */}
      <div className="timer-bottom-right" onClick={toggleTimer} onWheel={handleWheel}>
        <svg width={size} height={size} className="timer-svg">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isRunning ? "#ffffff" : "rgba(255, 255, 255, 0.5)"}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="progress-circle"
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="24"
            fontWeight="bold"
            fill={isRunning ? "#ffffff" : "rgba(255, 255, 255, 0.5)"}
          >
            {minutes}
          </text>
        </svg>
      </div>
    </div>
  );
}

export default App;
