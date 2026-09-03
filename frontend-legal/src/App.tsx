import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import ContractAnalysis from './pages/ContractAnalysis';
import DraftReview from './pages/DraftReview';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fa-analysis" element={<ContractAnalysis />} />
        <Route path="/fa-analysis/:conversationId" element={<ContractAnalysis />} />
        <Route path="/drafting" element={<DraftReview />} />
      </Routes>
    </Router>
  );
}

export default App;
