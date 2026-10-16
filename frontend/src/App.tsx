import { HashRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import AlarmList from './pages/AlarmList';
import AlarmEdit from './pages/AlarmEdit';
import TaskExecution from './pages/TaskExecution';
import Stats from './pages/Stats';
import AppPreview from './pages/AppPreview';
import TaskDemoPreview from './pages/TaskDemoPreview';
import NotFound from './pages/NotFound';
import AlarmScheduler from './components/custom/AlarmScheduler';

const App = () => (
  <HashRouter>
    {/* Watches the clock on every route and launches the wake-up task. */}
    <AlarmScheduler />
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/alarms" element={<AlarmList />} />
      <Route path="/edit/:id" element={<AlarmEdit />} />
      <Route path="/task/:id" element={<TaskExecution />} />
      <Route path="/stats" element={<Stats />} />
      <Route path="/f6db0085-1264-4a77-b32e-fa2731e8654f" element={<AppPreview />} />
      <Route path="/42ed530e-ac29-4218-87cd-e291989cf9c6" element={<TaskDemoPreview />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </HashRouter>
);

export default App;
