import React from 'react';

const TabGroup = ({ tabs }) => {
    const [activeTab, setActiveTab] = React.useState(0);

    return (
        <div>
            <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0' }}>
                {tabs.map((tab, index) => (
                    <button
                        key={index}
                        onClick={() => setActiveTab(index)}
                        style={{
                        flex: 1,
                        padding: "10px 20px",
                        border: "none",
                        borderRadius: "0px",
                        borderBottom: activeTab === index ? "3px solid blue" : "3px solid transparent",
                        background: "#e0e0e0",
                        color: "black",
                        cursor: "pointer",
                        fontWeight: activeTab === index ? "bold" : "normal"
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div style={{ padding: "20px" }}>
                {tabs[activeTab]?.content}
            </div>
        </div>
    );
}

export default TabGroup;